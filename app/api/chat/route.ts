import { createOpenAI } from '@ai-sdk/openai';
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

    // Configure OpenAI-compatible client for Groq
    const groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
    });

    // Build system message with image context
    const systemMessage = buildSystemMessage(imageContext);

    // Stream response using llama-3.1-70b-versatile
    const result = await streamText({
      model: groq('llama-3.1-70b-versatile'),
      system: systemMessage,
      messages,
    });

    // Return streamed response
    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
