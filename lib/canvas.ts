/**
 * Canvas rendering utilities with aspect ratio preservation
 * 
 * Performance optimizations:
 * - Reuses CanvasRenderingContext2D instead of getting context on each render
 * - Reuses ImageData object when dimensions match to reduce allocations
 * - Uses OffscreenCanvas when available for better performance
 * 
 * Export utilities:
 * - Supports upscaling processed images to original dimensions for export
 * - Uses high-quality interpolation for export upscaling
 */

export const MAX_CANVAS_WIDTH = 800;
export const MAX_CANVAS_HEIGHT = 600;

/**
 * Transform state for canvas zoom and pan operations
 */
export interface CanvasTransform {
  /** Zoom level (0.1 to 5.0) */
  scale: number;
  /** Horizontal pan offset in pixels */
  x: number;
  /** Vertical pan offset in pixels */
  y: number;
}

/**
 * Default transform state (no zoom, no pan)
 */
export const DEFAULT_TRANSFORM: CanvasTransform = {
  scale: 1,
  x: 0,
  y: 0,
};

/**
 * Zoom limits for canvas navigation
 */
export const ZOOM_LIMITS = {
  min: 0.1,
  max: 5.0,
  step: 0.1,
};

/**
 * Represents a touch point for gesture handling
 */
export interface TouchPoint {
  x: number;
  y: number;
  id: number;
}

/**
 * State for tracking pinch-to-zoom gestures
 */
export interface PinchState {
  /** Initial distance between two touch points */
  initialDistance: number;
  /** Initial center point between the two touches */
  initialCenter: { x: number; y: number };
  /** Scale at the start of the pinch */
  initialScale: number;
  /** Transform at the start of the pinch */
  initialTransform: CanvasTransform;
}

/**
 * Calculates the distance between two touch points
 */
export function getTouchDistance(touch1: TouchPoint, touch2: TouchPoint): number {
  const dx = touch2.x - touch1.x;
  const dy = touch2.y - touch1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the center point between two touch points
 */
export function getTouchCenter(touch1: TouchPoint, touch2: TouchPoint): { x: number; y: number } {
  return {
    x: (touch1.x + touch2.x) / 2,
    y: (touch1.y + touch2.y) / 2,
  };
}

/**
 * Converts screen coordinates to canvas-relative coordinates,
 * accounting for CSS transforms on the canvas element.
 * 
 * This is critical for accurate zoom focal point calculations when
 * the canvas has been scaled/translated via CSS transforms.
 * 
 * @param screenX - Screen X coordinate (e.g., event.clientX)
 * @param screenY - Screen Y coordinate (e.g., event.clientY)
 * @param containerRect - Bounding rect of the container element
 * @param canvasWidth - Intrinsic canvas width (canvas.width)
 * @param canvasHeight - Intrinsic canvas height (canvas.height)
 * @param transform - Current CSS transform applied to canvas
 * @returns Coordinates relative to the untransformed canvas
 */
export function screenToCanvasCoords(
  screenX: number,
  screenY: number,
  containerRect: DOMRect,
  canvasWidth: number,
  canvasHeight: number,
  transform: CanvasTransform
): { x: number; y: number } {
  // Get position relative to container center
  const containerCenterX = containerRect.left + containerRect.width / 2;
  const containerCenterY = containerRect.top + containerRect.height / 2;
  
  // Screen position relative to container center
  const relX = screenX - containerCenterX;
  const relY = screenY - containerCenterY;
  
  // The canvas is centered in the container, and CSS transform is:
  // translate(transform.x, transform.y) scale(transform.scale)
  // with transform-origin: center center
  // 
  // So to get the position on the untransformed canvas:
  // 1. Remove the translation offset
  // 2. Remove the scale
  // 3. Add the canvas center to get canvas-relative coords
  
  const canvasX = (relX - transform.x) / transform.scale + canvasWidth / 2;
  const canvasY = (relY - transform.y) / transform.scale + canvasHeight / 2;
  
  return { x: canvasX, y: canvasY };
}

/**
 * Calculates a transform for a pinch-to-zoom gesture.
 * The zoom is centered on the midpoint between the two touch points.
 * 
 * @param pinchState - Initial state when pinch started
 * @param currentDistance - Current distance between touch points
 * @param currentCenter - Current center between touch points
 * @param containerRect - Container bounding rect
 * @param canvasWidth - Canvas intrinsic width
 * @param canvasHeight - Canvas intrinsic height
 * @returns New transform state
 */
export function calculatePinchTransform(
  pinchState: PinchState,
  currentDistance: number,
  currentCenter: { x: number; y: number },
  containerRect: DOMRect,
  canvasWidth: number,
  canvasHeight: number
): CanvasTransform {
  // Calculate scale change
  const scaleRatio = currentDistance / pinchState.initialDistance;
  const newScale = Math.max(
    ZOOM_LIMITS.min,
    Math.min(ZOOM_LIMITS.max, pinchState.initialScale * scaleRatio)
  );
  
  // Get the pinch center relative to container center
  const containerCenterX = containerRect.left + containerRect.width / 2;
  const containerCenterY = containerRect.top + containerRect.height / 2;
  
  const initialCenterRel = {
    x: pinchState.initialCenter.x - containerCenterX,
    y: pinchState.initialCenter.y - containerCenterY,
  };
  
  const currentCenterRel = {
    x: currentCenter.x - containerCenterX,
    y: currentCenter.y - containerCenterY,
  };
  
  // The image point that was under the initial pinch center
  const imageX = (initialCenterRel.x - pinchState.initialTransform.x) / pinchState.initialScale;
  const imageY = (initialCenterRel.y - pinchState.initialTransform.y) / pinchState.initialScale;
  
  // Calculate new translation to keep that image point under the current pinch center
  // Also account for any panning (difference between initial and current center)
  const newX = currentCenterRel.x - imageX * newScale;
  const newY = currentCenterRel.y - imageY * newScale;
  
  return {
    scale: newScale,
    x: newX,
    y: newY,
  };
}

/**
 * Calculates a new transform after a zoom operation, maintaining the cursor focal point.
 * 
 * The zoom is centered on the cursor position, meaning the image point under the cursor
 * before zooming will remain under the cursor after zooming.
 * 
 * @param currentTransform - Current transform state
 * @param delta - Zoom delta (positive = zoom in, negative = zoom out)
 * @param cursorX - Cursor X position relative to canvas
 * @param cursorY - Cursor Y position relative to canvas
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns New transform with updated scale and offsets
 */
export function calculateZoomTransform(
  currentTransform: CanvasTransform,
  delta: number,
  cursorX: number,
  cursorY: number,
  canvasWidth: number,
  canvasHeight: number
): CanvasTransform {
  const { scale: oldScale, x: oldX, y: oldY } = currentTransform;
  
  // Calculate new scale with bounds clamping
  const scaleFactor = delta > 0 ? 1.1 : 0.9;
  const newScale = Math.max(
    ZOOM_LIMITS.min,
    Math.min(ZOOM_LIMITS.max, oldScale * scaleFactor)
  );
  
  // If scale didn't change (at limits), return current transform
  if (newScale === oldScale) {
    return currentTransform;
  }
  
  // Calculate the center of the canvas
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  
  // The cursor position relative to the canvas center (before transform)
  const cursorFromCenterX = cursorX - centerX;
  const cursorFromCenterY = cursorY - centerY;
  
  // The image point under the cursor (accounting for current transform)
  // With CSS transform origin at center, the transform is: translate(x, y) scale(s)
  // So a point P on screen maps to image point: (P - center - translate) / scale + center
  const imageX = (cursorFromCenterX - oldX) / oldScale;
  const imageY = (cursorFromCenterY - oldY) / oldScale;
  
  // After zoom, we want the same image point to be under the cursor
  // cursorFromCenter = newX + imageX * newScale
  // newX = cursorFromCenter - imageX * newScale
  const newX = cursorFromCenterX - imageX * newScale;
  const newY = cursorFromCenterY - imageY * newScale;
  
  return {
    scale: newScale,
    x: newX,
    y: newY,
  };
}

/**
 * Calculates a new transform after a pan operation.
 * 
 * @param currentTransform - Current transform state
 * @param deltaX - Horizontal pan delta in pixels
 * @param deltaY - Vertical pan delta in pixels
 * @returns New transform with updated offsets
 */
export function calculatePanTransform(
  currentTransform: CanvasTransform,
  deltaX: number,
  deltaY: number
): CanvasTransform {
  return {
    scale: currentTransform.scale,
    x: currentTransform.x + deltaX,
    y: currentTransform.y + deltaY,
  };
}

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
 * Export options for image export with upscaling
 */
export interface ExportOptions {
  /** Target width for export (typically original image width) */
  targetWidth: number;
  /** Target height for export (typically original image height) */
  targetHeight: number;
  /** Image format for export */
  format?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Quality for lossy formats (0-1) */
  quality?: number;
  /** Whether to use high-quality interpolation (slower but better) */
  highQuality?: boolean;
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
 * The canvas is sized to fit the image at its base scaled dimensions.
 * Zoom/pan is handled via CSS transforms on the canvas element.
 * 
 * @param ctx - The 2D rendering context of the target canvas
 * @param canvas - The canvas element (for resizing)
 * @param pixels - RGBA pixel data as Uint8Array
 * @param width - Image width
 * @param height - Image height
 * @param cache - Cached rendering resources (will be mutated)
 * @param _transform - Unused, kept for API compatibility (zoom/pan via CSS)
 */
export function renderImageToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  width: number,
  height: number,
  cache: CanvasRenderCache,
  _transform?: CanvasTransform
): void {
  // Calculate base scaled dimensions (fit-to-screen size)
  const scaled = calculateScaledDimensions(width, height);
  
  // Set canvas size to base scaled dimensions (zoom handled via CSS)
  if (canvas.width !== scaled.width || canvas.height !== scaled.height) {
    canvas.width = scaled.width;
    canvas.height = scaled.height;
  }
  
  // Check if we need to create/resize offscreen canvas
  // Offscreen canvas holds the full-resolution image data
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
  
  // Clear the canvas before drawing
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw the image at base scaled size (zoom/pan via CSS transform)
  ctx.drawImage(
    cache.offscreenCanvas as CanvasImageSource,
    0, 0, width, height,                    // source rect (full image)
    0, 0, scaled.width, scaled.height       // dest rect (base scaled size)
  );
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

/**
 * Creates an ImageData from pixel array for canvas operations
 * @param pixels - RGBA pixel data
 * @param width - Image width
 * @param height - Image height
 * @returns ImageData object
 */
export function createImageDataFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number
): ImageData {
  if (width <= 0 || height <= 0) {
    throw new Error('Width and height must be positive integers');
  }
  const expectedLength = width * height * 4;
  if (pixels.length !== expectedLength) {
    throw new Error(`Pixel array length (${pixels.length}) does not match dimensions (expected ${expectedLength})`);
  }
  const imageData = new ImageData(width, height);
  imageData.data.set(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength));
  return imageData;
}

/**
 * Upscales processed pixel data to target dimensions for export.
 * Uses canvas-based interpolation for high-quality upscaling.
 * 
 * @param pixels - Processed RGBA pixel data (at processing resolution)
 * @param sourceWidth - Current width of the pixel data
 * @param sourceHeight - Current height of the pixel data
 * @param options - Export options including target dimensions
 * @returns Promise with export result as data URL or Blob
 */
export async function exportWithUpscaling(
  pixels: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  options: ExportOptions
): Promise<{ dataUrl: string; blob: Blob }> {
  const {
    targetWidth,
    targetHeight,
    format = 'image/png',
    quality = 0.92,
    highQuality = true,
  } = options;
  
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Source dimensions must be positive');
  }
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error('Target dimensions must be positive');
  }
  const expectedLength = sourceWidth * sourceHeight * 4;
  if (pixels.length !== expectedLength) {
    throw new Error(`Pixel array length (${pixels.length}) does not match source dimensions (expected ${expectedLength})`);
  }
  
  // Create source canvas with processed pixels
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceCtx = sourceCanvas.getContext('2d');
  
  if (!sourceCtx) {
    throw new Error('Failed to get source canvas context');
  }
  
  // Put processed pixels on source canvas
  const imageData = createImageDataFromPixels(pixels, sourceWidth, sourceHeight);
  sourceCtx.putImageData(imageData, 0, 0);
  
  // If no upscaling needed, export directly from source
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    const dataUrl = sourceCanvas.toDataURL(format, quality);
    const blob = await canvasToBlob(sourceCanvas, format, quality);
    return { dataUrl, blob };
  }
  
  // Create target canvas at export dimensions
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetCtx = targetCanvas.getContext('2d');
  
  if (!targetCtx) {
    throw new Error('Failed to get target canvas context');
  }
  
  // Configure interpolation quality
  if (highQuality) {
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = 'high';
  } else {
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = 'medium';
  }
  
  // Draw upscaled image
  targetCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  
  // Export
  const dataUrl = targetCanvas.toDataURL(format, quality);
  const blob = await canvasToBlob(targetCanvas, format, quality);
  
  return { dataUrl, blob };
}

/**
 * Converts canvas to Blob with specified format and quality
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      format,
      quality
    );
  });
}

/**
 * Gets pixel data from canvas at specified dimensions
 * Useful for extracting upscaled pixel data for further processing
 * 
 * @param canvas - Source canvas
 * @param width - Target width
 * @param height - Target height
 * @returns Uint8Array of RGBA pixel data
 */
export function getUpscaledPixels(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Uint8Array {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, width, height);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  return new Uint8Array(imageData.data.buffer);
}

/**
 * Clears a canvas render cache to free memory
 * @param cache - The cache to clear
 */
export function clearCanvasRenderCache(cache: CanvasRenderCache): void {
  cache.offscreenCanvas = null;
  cache.offscreenCtx = null;
  cache.imageData = null;
  cache.cachedWidth = 0;
  cache.cachedHeight = 0;
}

/**
 * Calculates the memory size of a canvas render cache
 * @param cache - The cache to measure
 * @returns Size in bytes
 */
export function getCanvasRenderCacheSize(cache: CanvasRenderCache): number {
  if (!cache.imageData || cache.cachedWidth === 0 || cache.cachedHeight === 0) {
    return 0;
  }
  // ImageData contains RGBA data: width × height × 4 bytes per pixel
  return cache.cachedWidth * cache.cachedHeight * 4;
}
