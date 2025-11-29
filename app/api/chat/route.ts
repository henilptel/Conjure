import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';
import { buildSystemMessage, parseRequestBody } from '@/lib/chat';

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
    // Parse request body
    const body = await req.json();
    const { messages, imageContext } = parseRequestBody(body);

    // Configure Groq provider
    const groq = createGroq({
      apiKey,
    });

    // Build system message with image context
    const systemMessage = buildSystemMessage(imageContext);

    // Convert messages to the format expected by the AI SDK
    // Ensure we only send simple text content
    const formattedMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => m.content && m.content.trim().length > 0)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content),
      }));

    // Stream response using llama-3.3-70b-versatile
    const result = streamText({
      model: groq('llama-3.3-70b-versatile'),
      system: systemMessage,
      messages: formattedMessages,
    });

    // Return streamed response
    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    // Distinguish between client and server errors
    const isClientError = error instanceof SyntaxError; // JSON parse error
    const status = isClientError ? 400 : 500;
    const message = isClientError 
      ? 'Invalid request body' 
      : 'An error occurred processing your request';
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
