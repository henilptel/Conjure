/**
 * Processing message utilities for dynamic feedback
 * Requirements: 3.2
 */

/**
 * Processing message mapping for dynamic feedback
 * Maps tool IDs to user-friendly processing messages
 * Requirements: 3.2
 */
export const PROCESSING_MESSAGES: Record<string, string> = {
  blur: 'Applying Blur...',
  contrast: 'Adjusting Contrast...',
  brightness: 'Adjusting Brightness...',
  saturation: 'Adjusting Saturation...',
  grayscale: 'Converting to Grayscale...',
  invert: 'Inverting Colors...',
  rotate: 'Rotating Image...',
  sepia: 'Applying Sepia...',
  sharpen: 'Sharpening Image...',
  hue: 'Adjusting Hue...',
  charcoal: 'Applying Charcoal Effect...',
  edge_detect: 'Detecting Edges...',
  wave: 'Applying Wave Effect...',
  solarize: 'Applying Solarize...',
  vignette: 'Adding Vignette...',
};

/**
 * Gets the processing message for a given tool ID
 * Returns a tool-specific message or a default "Processing..." message
 * Uses Object.hasOwn to avoid prototype chain issues with keys like 'toString' or '__proto__'
 * Requirements: 3.2
 * 
 * @param toolId - The ID of the tool being processed
 * @returns A user-friendly message describing the processing action
 */
export function getProcessingMessage(toolId: string): string {
  if (!Object.hasOwn(PROCESSING_MESSAGES, toolId)) {
    return 'Processing...';
  }
  return PROCESSING_MESSAGES[toolId];
}
