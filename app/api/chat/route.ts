import { createGroq } from '@ai-sdk/groq';
import { streamText, UIMessage } from 'ai';
import { buildSystemMessage } from '@/lib/chat';
import { ImageState } from '@/lib/types';

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

    // Stream response using llama-3.3-70b-versatile
    const result = streamText({
      model: groq('llama-3.3-70b-versatile'),
      system: systemMessage,
      messages: formattedMessages,
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
