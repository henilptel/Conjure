import { createGroq } from '@ai-sdk/groq';
import { streamText, UIMessage, tool } from 'ai';
import { z } from 'zod';
import { buildSystemMessage } from '@/lib/chat';
import { ImageState, TOOL_CONFIGS } from '@/lib/types';

/**
 * Zod schema for the show_tools tool.
 * Defines tools_to_show as an array of enum values.
 * Requirements: 7.1, 7.2
 */
const showToolsSchema = z.object({
  tools_to_show: z.array(
    z.enum(['blur', 'grayscale', 'sepia', 'contrast'])
  ).describe('Array of tool identifiers to display in the HUD panel'),
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
          description: 'Summons image editing tool controls to the HUD panel. Call this when the user requests an image edit.',
          parameters: showToolsSchema,
          execute: async ({ tools_to_show }) => {
            // Return tool configurations for the client to render
            const toolConfigs = tools_to_show.map(toolName => {
              const config = TOOL_CONFIGS[toolName];
              return {
                id: config.id,
                label: config.label,
                min: config.min,
                max: config.max,
                defaultValue: config.defaultValue,
              };
            });
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
