/**
 * Canvas rendering utilities with aspect ratio preservation
 * 
 * Performance optimizations:
 * - Reuses CanvasRenderingContext2D instead of getting context on each render
 * - Reuses ImageData object when dimensions match to reduce allocations
 * - Uses OffscreenCanvas when available for better performance
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
 * Cached resources for canvas rendering
 * Passed to renderImageToCanvas to enable resource reuse across renders
 */
export interface CanvasRenderCache {
  /** Cached OffscreenCanvas for intermediate rendering */
  offscreenCanvas: OffscreenCanvas | HTMLCanvasElement | null;
  /** Cached offscreen canvas context */
  offscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  /** Cached ImageData for pixel transfer */
  imageData: ImageData | null;
  /** Cached dimensions of the ImageData */
  cachedWidth: number;
  cachedHeight: number;
}

/**
 * Creates an empty cache object for canvas rendering
 */
export function createCanvasRenderCache(): CanvasRenderCache {
  return {
    offscreenCanvas: null,
    offscreenCtx: null,
    imageData: null,
    cachedWidth: 0,
    cachedHeight: 0,
  };
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
 * Renders pixel data to a canvas using cached resources for performance.
 * 
 * Performance improvements:
 * - Accepts pre-obtained CanvasRenderingContext2D to avoid repeated getContext() calls
 * - Reuses offscreen canvas and ImageData when dimensions match
 * - Updates cache in-place with new resources when dimensions change
 * 
 * @param ctx - The 2D rendering context of the target canvas
 * @param canvas - The canvas element (for resizing)
 * @param pixels - RGBA pixel data as Uint8Array
 * @param width - Image width
 * @param height - Image height
 * @param cache - Cached rendering resources (will be mutated)
 */
export function renderImageToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  width: number,
  height: number,
  cache: CanvasRenderCache
): void {
  // Calculate scaled dimensions
  const scaled = calculateScaledDimensions(width, height);
  
  // Set canvas size to scaled dimensions (only if changed)
  if (canvas.width !== scaled.width || canvas.height !== scaled.height) {
    canvas.width = scaled.width;
    canvas.height = scaled.height;
  }
  
  // Check if we need to create/resize offscreen canvas
  const needsNewOffscreen = 
    !cache.offscreenCanvas ||
    cache.cachedWidth !== width ||
    cache.cachedHeight !== height;
  
  if (needsNewOffscreen) {
    // Create offscreen canvas - prefer OffscreenCanvas for better performance
    if (typeof OffscreenCanvas !== 'undefined') {
      cache.offscreenCanvas = new OffscreenCanvas(width, height);
    } else {
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      cache.offscreenCanvas = offscreen;
    }
    
    // Cache the offscreen context
    cache.offscreenCtx = cache.offscreenCanvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    
    // Create new ImageData with matching dimensions
    cache.imageData = new ImageData(width, height);
    cache.cachedWidth = width;
    cache.cachedHeight = height;
  }
  
  if (!cache.offscreenCtx) {
    throw new Error('Failed to get offscreen canvas context');
  }
  
  // Reuse ImageData by copying pixels into it
  const imageData = cache.imageData!;
  imageData.data.set(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength));
  
  // Put image data on offscreen canvas using cached context
  cache.offscreenCtx.putImageData(imageData, 0, 0);
  
  // Draw scaled image to main canvas
  ctx.drawImage(cache.offscreenCanvas as CanvasImageSource, 0, 0, scaled.width, scaled.height);
}

/**
 * Legacy function for backwards compatibility - creates cache internally
 * @deprecated Use the version with CanvasRenderCache for better performance
 */
export function renderImageToCanvasLegacy(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  width: number,
  height: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // Create a temporary cache (not ideal, but maintains backwards compatibility)
  const tempCache = createCanvasRenderCache();
  renderImageToCanvas(ctx, canvas, pixels, width, height, tempCache);
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
