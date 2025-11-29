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

  // Validate message structure
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      throw new Error('Invalid message format');
    }
    const { role, content } = msg as { role?: unknown; content?: unknown };
    if (typeof role !== 'string' || !['user', 'assistant', 'system'].includes(role)) {
      throw new Error('Invalid message role');
    }
    if (typeof content !== 'string') {
      throw new Error('Invalid message content');
    }
  }

  if (!imageContext || typeof imageContext !== 'object') {
    throw new Error('imageContext is required');
  }

  // Validate imageContext structure
  const ctx = imageContext as Record<string, unknown>;
  if (typeof ctx.hasImage !== 'boolean') {
    throw new Error('imageContext.hasImage must be a boolean');
  }
  if (ctx.width !== undefined && ctx.width !== null && typeof ctx.width !== 'number') {
    throw new Error('imageContext.width must be a number or null');
  }
  if (ctx.height !== undefined && ctx.height !== null && typeof ctx.height !== 'number') {
    throw new Error('imageContext.height must be a number or null');
  }
  if (typeof ctx.blur !== 'number') {
    throw new Error('imageContext.blur must be a number');
  }
  if (typeof ctx.isGrayscale !== 'boolean') {
    throw new Error('imageContext.isGrayscale must be a boolean');
  }

  return {
    messages: messages as ChatMessage[],
    imageContext: imageContext as ImageState,
  };
}

/**
 * Returns CSS classes for message styling based on role.
 * User messages are styled with blue background and right-aligned.
 * Assistant messages are styled with zinc background and left-aligned.
 */
export function getMessageClasses(role: 'user' | 'assistant' | 'system'): string {
  if (role === 'user') {
    return 'bg-blue-600 text-white ml-auto';
  }
  return 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 mr-auto';
}
