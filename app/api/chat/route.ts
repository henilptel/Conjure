import { createGroq } from '@ai-sdk/groq';
import { streamText, UIMessage, tool } from 'ai';
import { z } from 'zod';
import { buildSystemMessage } from '@/lib/chat';
import { ImageState, TOOL_CONFIGS } from '@/lib/types';

/**
 * Zod schema for the show_tools tool.
 * Defines tools_to_show as an array of tool configurations with optional initial values.
 * Requirements: 7.1, 7.2
 */
const showToolsSchema = z.object({
  tools: z.array(
    z.object({
      name: z.enum(['blur', 'grayscale', 'sepia', 'contrast']).describe('Tool identifier'),
      initial_value: z.number().optional().describe('Optional initial value to apply immediately'),
    })
  ).describe('Array of tools to display with optional initial values'),
});

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
    // Parse request body - v5 format with UIMessage parts
    const body = await req.json();
    const { messages, imageContext } = body as { 
      messages: UIMessage[]; 
      imageContext: ImageState;
    };

    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }

    if (!imageContext || typeof imageContext !== 'object') {
      throw new Error('imageContext is required');
    }

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

    // Stream response using llama-3.3-70b-versatile with show_tools tool
    // Requirements: 7.4
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
            const toolConfigs = tools
              .map(({ name, initial_value }) => {
                const config = TOOL_CONFIGS[name];
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
      },
    });

    // Return UI message stream response (v5 format)
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
