import { ImageState } from '@/lib/types';

/**
 * Builds the system message with the current image context.
 * This function is separated for testing purposes.
 */
export function buildSystemMessage(imageContext: ImageState): string {
  const dimensionsText = imageContext.hasImage && imageContext.width && imageContext.height
    ? `${imageContext.width}x${imageContext.height} pixels`
    : 'No image loaded';

  return `You are an AI assistant for an image editing application. 
Current image state:
- Image loaded: ${imageContext.hasImage}
- Dimensions: ${dimensionsText}
- Blur level: ${imageContext.blur}
- Grayscale: ${imageContext.isGrayscale}

Help the user with their image editing questions. When asked about the current state, refer to the values above.`;
}

/**
 * Message type for chat messages
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Parses and validates the request body.
 * Returns the parsed data or throws an error if invalid.
 */
export function parseRequestBody(body: unknown): { messages: ChatMessage[]; imageContext: ImageState } {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const { messages, imageContext } = body as { messages?: unknown; imageContext?: unknown };

  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array');
  }

  if (!imageContext || typeof imageContext !== 'object') {
    throw new Error('imageContext is required');
  }

  return {
    messages: messages as ChatMessage[],
    imageContext: imageContext as ImageState,
  };
}
