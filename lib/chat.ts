import { ImageState } from '@/lib/types';

/**
 * Builds the system message with the current image context.
 * This function is separated for testing purposes.
 * Updated to instruct AI to use show_tools for edit requests.
 * Requirements: 7.3
 */
export function buildSystemMessage(imageContext: ImageState): string {
  const dimensionsText = imageContext.hasImage && imageContext.width && imageContext.height
    ? `${imageContext.width}x${imageContext.height} pixels`
    : 'No image loaded';

  const activeToolsText = imageContext.activeTools && imageContext.activeTools.length > 0
    ? imageContext.activeTools.map(t => `${t.label}: ${t.value}`).join(', ')
    : 'None';

  return `You are an AI assistant for an image editing application called MagickFlow.

Current image state:
- Image loaded: ${imageContext.hasImage}
- Dimensions: ${dimensionsText}
- Blur level: ${imageContext.blur}
- Grayscale: ${imageContext.isGrayscale}
- Active tools: ${activeToolsText}

IMPORTANT: You have access to a show_tools function that summons editing controls AND applies initial values.

Available tools and their ranges:
- blur: Applies gaussian blur (0-20). Good starting value: 5-10 for subtle blur, 15-20 for strong blur
- grayscale: Converts to grayscale (0-100). Use 100 for full grayscale, 50 for partial
- sepia: Applies sepia tone (0-100). Use 50-70 for vintage look
- contrast: Adjusts contrast (-100 to +100). Use 20-40 for subtle boost, -20 to -40 to reduce

When the user requests an image edit:
1. Call show_tools with the appropriate tools AND set initial_value to apply the effect immediately
2. Choose sensible initial values based on the user's request intensity (e.g., "a little blur" = 5, "very blurry" = 15)
3. Respond briefly confirming what you've applied

Examples:
- "blur it" → show_tools with blur, initial_value: 8
- "make it vintage" → show_tools with sepia (initial_value: 60) and contrast (initial_value: 20)
- "add some contrast" → show_tools with contrast, initial_value: 25
- "make it very blurry" → show_tools with blur, initial_value: 18

ALWAYS set an initial_value when summoning tools so the user sees an immediate effect.
Do NOT describe how to manually adjust settings. ALWAYS use show_tools.`;
}

/**
 * Message type for chat messages
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Extracts text content from a message.
 * Handles both legacy format (content string) and AI SDK v5 format (parts array).
 */
function extractMessageContent(msg: Record<string, unknown>): string {
  // Legacy format: content is a string
  if (typeof msg.content === 'string') {
    return msg.content;
  }
  
  // AI SDK v5 format: parts array with text parts
  if (Array.isArray(msg.parts)) {
    const textParts = msg.parts
      .filter((part): part is { type: string; text: string } => 
        part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string'
      )
      .map(part => part.text);
    return textParts.join('');
  }
  
  return '';
}

/**
 * Parses and validates the request body.
 * Returns the parsed data or throws an error if invalid.
 * Supports both legacy message format (content) and AI SDK v5 format (parts).
 */
export function parseRequestBody(body: unknown): { messages: ChatMessage[]; imageContext: ImageState } {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const { messages, imageContext } = body as { messages?: unknown; imageContext?: unknown };

  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array');
  }

  // Validate and convert message structure
  const parsedMessages: ChatMessage[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      throw new Error('Invalid message format');
    }
    const msgObj = msg as Record<string, unknown>;
    const { role } = msgObj;
    if (typeof role !== 'string' || !['user', 'assistant', 'system'].includes(role)) {
      throw new Error('Invalid message role');
    }
    
    const content = extractMessageContent(msgObj);
    if (content) {
      parsedMessages.push({
        role: role as 'user' | 'assistant' | 'system',
        content,
      });
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
    messages: parsedMessages,
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
