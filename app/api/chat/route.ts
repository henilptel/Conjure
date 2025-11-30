import { createGroq } from '@ai-sdk/groq';
import { streamText, tool } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildSystemMessage } from '@/lib/chat';
import { TOOL_REGISTRY, getAllToolIds } from '@/lib/tools-registry';

/**
 * Checks if an error is a client-caused error (4xx status)
 */
function isClientError(error: unknown): { isClient: boolean; status: number; message: string } {
  // Check for errors with statusCode property (common in API clients)
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    if (statusCode >= 400 && statusCode < 500) {
      const message = 'message' in error ? String((error as { message: string }).message) : 'Client error';
      return { isClient: true, status: statusCode, message };
    }
  }
  
  // Check for errors with status property (fetch-style errors)
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status >= 400 && status < 500) {
      const message = 'message' in error ? String((error as { message: string }).message) : 'Client error';
      return { isClient: true, status, message };
    }
  }
  
  // Check for JSON parse errors (malformed request body)
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return { isClient: true, status: 400, message: 'Invalid JSON in request body' };
  }
  
  // Check for TypeError that might indicate missing required fields
  if (error instanceof TypeError) {
    return { isClient: true, status: 400, message: 'Missing or invalid required fields' };
  }
   
   return { isClient: false, status: 500, message: 'Internal server error' };
  return { isClient: false, status: 500, message: 'Internal server error' };
}

/**
 * Zod schema for UIMessage parts - validates the parts array structure
 * AI SDK v5 uses typed tool parts (tool-${toolName}) instead of generic tool-invocation
 * We use a custom validator to handle both known types and dynamic tool-* types
 */
const knownPartTypes = ['text', 'source', 'file', 'reasoning', 'step-start', 'dynamic-tool'] as const;

const messagePartSchema = z.union([
  // Known part types
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('source'), source: z.unknown() }),
  z.object({ type: z.literal('file'), mediaType: z.string(), url: z.string() }),
  z.object({ type: z.literal('reasoning'), text: z.string() }),
  z.object({ type: z.literal('step-start') }),
  z.object({ type: z.literal('dynamic-tool'), toolName: z.string(), toolCallId: z.string(), input: z.unknown(), state: z.string() }),
  // AI SDK v5 tool parts: type is "tool-{toolName}" (e.g., "tool-show_tools")
  // These have toolCallId, input, state, and optionally output/errorText
  z.object({
    type: z.string().refine(t => t.startsWith('tool-'), { message: 'Tool part type must start with "tool-"' }),
    toolCallId: z.string(),
    input: z.unknown().optional(),
    state: z.string(),
    output: z.unknown().optional(),
    errorText: z.string().optional(),
  }),
]);

/**
 * Zod schema for UIMessage - validates message structure from AI SDK v5
 */
const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(messagePartSchema).optional(),
});

/**
 * Zod schema for ImageState - validates the image context structure
 */
const imageStateSchema = z.object({
  hasImage: z.boolean(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  blur: z.number(),
  isGrayscale: z.boolean(),
  activeTools: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.number(),
    min: z.number(),
    max: z.number(),
  })),
});

/**
 * Zod schema for the complete request body
 */
const chatRequestSchema = z.object({
  messages: z.array(uiMessageSchema),
  imageContext: imageStateSchema,
});

/**
 * Creates the Zod schema for the show_tools tool dynamically from TOOL_REGISTRY.
 * This ensures the schema always matches the available tools.
 * Requirements: 7.1, 7.2, 4.1
 */
function createShowToolsSchema() {
  const toolIds = getAllToolIds();
  if (toolIds.length === 0) {
    throw new Error('TOOL_REGISTRY must contain at least one tool');
  }
  // Create enum from registry tool IDs
  const toolNameEnum = z.enum(toolIds as [string, ...string[]]);
  
  return z.object({
    tools: z.array(
      z.object({
        name: toolNameEnum.describe('Tool identifier'),
        initial_value: z.number().optional().describe('Optional initial value to apply immediately'),
      })
    ).describe('Array of tools to display with optional initial values'),
  });
}

/**
 * Creates the Zod schema for the remove_tools tool dynamically from TOOL_REGISTRY.
 */
function createRemoveToolsSchema() {
  const toolIds = getAllToolIds();
  if (toolIds.length === 0) {
    throw new Error('TOOL_REGISTRY must contain at least one tool');
  }
  const toolNameEnum = z.enum(toolIds as [string, ...string[]]);
  
  return z.object({
    tools: z.array(toolNameEnum).describe('Array of tool identifiers to remove'),
  });
}

export async function POST(req: Request) {
  // Check for API key
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse and validate request body with Zod schema
    const body = await req.json();
    const parseResult = chatRequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      return new Response(
        JSON.stringify({ error: `Invalid request body: ${errorMessage}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const { messages, imageContext } = parseResult.data;

    // Configure Groq provider
    const groq = createGroq({
      apiKey,
    });

    // Build system message with image context
    const systemMessage = buildSystemMessage(imageContext);

    // Convert UIMessage parts to simple content format for the model
    const formattedMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        // Extract text from parts array (v5 format)
        const textContent = m.parts
          ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text)
          .join('') || '';
        
        return {
          role: m.role as 'user' | 'assistant',
          content: textContent,
        };
      })
      .filter(m => m.content.trim().length > 0);

    // Create schemas dynamically from registry
    const showToolsSchema = createShowToolsSchema();
    const removeToolsSchema = createRemoveToolsSchema();

    // Stream response using llama-3.3-70b-versatile with show_tools and remove_tools
    // Requirements: 7.4, 4.1, 4.2, 4.3
    const result = streamText({
      model: groq('llama-3.3-70b-versatile'),
      system: systemMessage,
      messages: formattedMessages,
      tools: {
        show_tools: tool({
          description: 'Summons image editing tool controls to the HUD panel and optionally applies initial values. Call this when the user requests an image edit.',
          inputSchema: showToolsSchema,
          execute: async ({ tools }) => {
            // Return tool configurations with initial values for the client to render
            // Uses TOOL_REGISTRY for dynamic tool lookup
            const toolConfigs = tools
              .map(({ name, initial_value }) => {
                const config = TOOL_REGISTRY[name];
                // Skip unknown tool names with a warning
                if (!config) {
                  console.warn(`Unknown tool name: ${name}, skipping`);
                  return null;
                }
                // Use initial_value if provided, otherwise use defaultValue
                const value = initial_value !== undefined 
                  ? Math.max(config.min, Math.min(config.max, initial_value))
                  : config.defaultValue;
                return {
                  id: config.id,
                  label: config.label,
                  min: config.min,
                  max: config.max,
                  value,
                };
              })
              .filter((config): config is NonNullable<typeof config> => config !== null);
            return { tools: toolConfigs };
          },
        }),
        remove_tools: tool({
          description: 'Removes image editing tool controls from the HUD panel. Call this when the user wants to remove or reset an effect.',
          inputSchema: removeToolsSchema,
          execute: async ({ tools }) => {
            // Return the list of tools to remove for the client to process
            return { tools };
          },
        }),
      },
    });

    // Return UI message stream response (v5 format)
    return result.toUIMessageStreamResponse();
  } catch (error) {
    // Log full error details for debugging
    console.error('Chat API error:', error);
    
    // Determine if this is a client or server error
    const errorInfo = isClientError(error);
    
    if (errorInfo.isClient) {
      // Client error: return specific status and message
      return NextResponse.json(
        { error: errorInfo.message },
        { status: errorInfo.status }
      );
    }
    
    // Server error: return generic message, don't expose internal details
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
