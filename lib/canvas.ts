/**
 * Canvas rendering utilities with aspect ratio preservation
 */

export const MAX_CANVAS_WIDTH = 800;
export const MAX_CANVAS_HEIGHT = 600;

export interface CanvasDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface ScaledDimensions {
  width: number;
  height: number;
  scale: number;
}

/**
 * Calculates scaled dimensions that fit within max bounds while preserving aspect ratio
 * @param originalWidth - Original image width
 * @param originalHeight - Original image height
 * @param maxWidth - Maximum allowed width (default: MAX_CANVAS_WIDTH)
 * @param maxHeight - Maximum allowed height (default: MAX_CANVAS_HEIGHT)
 * @returns Scaled dimensions with scale factor
 */
export function calculateScaledDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number = MAX_CANVAS_WIDTH,
  maxHeight: number = MAX_CANVAS_HEIGHT
): ScaledDimensions {
  if (originalWidth <= 0 || originalHeight <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }

  const aspectRatio = originalWidth / originalHeight;
  
  let scaledWidth = originalWidth;
  let scaledHeight = originalHeight;
  
  // Scale down if width exceeds max
  if (scaledWidth > maxWidth) {
    scaledWidth = maxWidth;
    scaledHeight = scaledWidth / aspectRatio;
  }
  
  // Scale down if height still exceeds max
  if (scaledHeight > maxHeight) {
    scaledHeight = maxHeight;
    scaledWidth = scaledHeight * aspectRatio;
  }
  
  const scale = scaledWidth / originalWidth;
  
  return {
    width: Math.round(scaledWidth),
    height: Math.round(scaledHeight),
    scale,
  };
}

/**
 * Renders pixel data to a canvas element
 * @param canvas - The canvas element to render to
 * @param pixels - RGBA pixel data as Uint8Array
 * @param width - Image width
 * @param height - Image height
 */
export function renderImageToCanvas(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  width: number,
  height: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Calculate scaled dimensions
  const scaled = calculateScaledDimensions(width, height);
  
  // Set canvas size to scaled dimensions
  canvas.width = scaled.width;
  canvas.height = scaled.height;
  
  // Create an offscreen canvas at original size
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offscreenCtx = offscreen.getContext('2d');
  
  if (!offscreenCtx) {
    throw new Error('Failed to get offscreen canvas context');
  }
  
  // Create ImageData from pixels
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  offscreenCtx.putImageData(imageData, 0, 0);
  
  // Draw scaled image to main canvas
  ctx.drawImage(offscreen, 0, 0, scaled.width, scaled.height);
}

/**
 * Gets the aspect ratio of given dimensions
 * @param width - Width
 * @param height - Height
 * @returns Aspect ratio (width / height)
 */
export function getAspectRatio(width: number, height: number): number {
  if (height === 0) return 0;
  return width / height;
}
