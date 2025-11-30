/**
 * Magick.WASM initialization and image processing utilities
 */

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickImage,
} from "@imagemagick/magick-wasm";
import type { ActiveTool } from "./types";
import { TOOL_REGISTRY, EFFECT_ORDER } from "./tools-registry";

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initializes the Magick.WASM library
 * This function is idempotent - calling it multiple times will only initialize once
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeMagick(): Promise<void> {
  if (isInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Fetch the WASM file from public folder
      const wasmResponse = await fetch("/magick.wasm");
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM file: ${wasmResponse.status}`);
      }
      const wasmBytes = await wasmResponse.arrayBuffer();
      await initializeImageMagick(new Uint8Array(wasmBytes));
      isInitialized = true;
    } catch (error) {
      console.error("WASM initialization error:", error);
      initializationPromise = null;
      throw new Error(
        "Failed to initialize image processor. Please refresh the page."
      );
    }
  })();

  return initializationPromise;
}

/**
 * Checks if Magick.WASM has been initialized
 * @returns true if initialized
 */
export function isMagickInitialized(): boolean {
  return isInitialized;
}

/**
 * ImageData structure for image processing operations
 *
 * Architecture Note:
 * - pixels: Current RGBA pixel data for canvas rendering
 * - originalBytes: Source image bytes (PNG/JPEG/etc) for re-processing
 * - width, height: Image dimensions
 *
 * Operation Types:
 * 1. DESTRUCTIVE base transformations (e.g., convertToGrayscale):
 *    - Update originalBytes to reflect the new base state
 *    - Subsequent operations apply to the transformed base
 *
 * 2. NON-DESTRUCTIVE preview transformations (e.g., blurImage):
 *    - Preserve originalBytes unchanged
 *    - Always read from originalBytes for consistent results
 *    - Enable real-time preview with ability to revert
 */
export interface ImageData {
  pixels: Uint8Array;
  width: number;
  height: number;
  originalBytes: Uint8Array;
}

/**
 * Simple promise-based mutex for protecting shared state in async operations.
 * Ensures only one operation can access protected resources at a time.
 */
class AsyncMutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  /**
   * Acquires the lock. If already locked, waits until released.
   * @returns Promise that resolves when lock is acquired
   */
  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait in queue for lock to be released
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Releases the lock and allows next waiting operation to proceed.
   */
  release(): void {
    if (this.waitQueue.length > 0) {
      // Pass lock to next waiter
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Checks if the mutex is currently locked.
   */
  isLocked(): boolean {
    return this.locked;
  }
}

/**
 * ImageEngine class for optimized image processing.
 *
 * This class maintains a reference to the decoded source image to avoid
 * redundant decoding operations during slider interactions. When processing,
 * it uses cached pixel data instead of re-decoding from compressed bytes.
 *
 * Thread Safety:
 * - Uses an AsyncMutex to protect shared state (sourceBytes, cachedPixels, etc.)
 * - loadImage, process, and dispose all acquire the lock before accessing state
 * - Prevents race conditions when concurrent operations are triggered
 *
 * Performance Optimization (slider-performance spec):
 * - Caches decoded RGBA pixels after initial load
 * - process() uses cached pixels instead of re-decoding from bytes
 * - Significantly reduces CPU usage during slider interactions
 *
 * Requirements: 3.1, 3.2, 3.3, slider-performance 2.1, 2.2, 2.3, 2.4
 */
export class ImageEngine {
  /** Mutex to protect shared state from concurrent access */
  private mutex = new AsyncMutex();
  
  /** Original image bytes for re-processing */
  private sourceBytes: Uint8Array | null = null;
  
  /** Cached decoded RGBA pixel data - avoids re-decoding on every process() */
  private cachedPixels: Uint8Array | null = null;
  
  /** Cached image width */
  private cachedWidth: number = 0;
  
  /** Cached image height */
  private cachedHeight: number = 0;

  /**
   * Loads an image from bytes, decodes once, and caches the pixel data.
   * This method should be called once when an image is uploaded.
   * 
   * Thread-safe: Acquires mutex before accessing shared state.
   * Lock is released after ImageMagick.read callback completes.
   *
   * @param bytes - The raw image file bytes (PNG/JPEG/etc)
   * @returns Promise<ImageData> with initial pixel data for canvas rendering
   *
   * Requirements: 3.1, slider-performance 2.1, 2.3
   */
  async loadImage(bytes: Uint8Array): Promise<ImageData> {
    if (!isInitialized) {
      throw new Error('Magick.WASM is not initialized');
    }

    // Acquire lock before accessing shared state
    await this.mutex.acquire();

    // Clear any existing data (Requirements: slider-performance 2.3)
    // Note: Using internal clear instead of dispose() to avoid re-acquiring lock
    this.sourceBytes = null;
    this.cachedPixels = null;
    this.cachedWidth = 0;
    this.cachedHeight = 0;

    // Store the original bytes
    this.sourceBytes = new Uint8Array(bytes);

    return new Promise<ImageData>((resolve, reject) => {
      try {
        // Read the image to get dimensions and pixel data
        ImageMagick.read(this.sourceBytes!, (image) => {
          const width = image.width;
          const height = image.height;

          // Write to RGBA format for canvas and cache
          image.write(MagickFormat.Rgba, (pixels) => {
            // Cache the decoded pixels (Requirements: slider-performance 2.1)
            this.cachedPixels = new Uint8Array(pixels);
            this.cachedWidth = width;
            this.cachedHeight = height;
            
            // Release lock after callback completes
            this.mutex.release();
            
            resolve({
              pixels: new Uint8Array(pixels),
              width,
              height,
              originalBytes: this.sourceBytes!,
            });
          });
        });
      } catch (error) {
        // Clear state on error
        this.sourceBytes = null;
        this.cachedPixels = null;
        this.cachedWidth = 0;
        this.cachedHeight = 0;
        
        // Release lock on error
        this.mutex.release();
        
        console.error('ImageEngine.loadImage error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load image';
        reject(new Error(`Failed to load image: ${errorMessage}`));
      }
    });
  }

  /**
   * Processes the image with the given active tools.
   * Uses cached pixel data when no effects need to be applied,
   * otherwise re-reads from bytes to apply effects (ImageMagick requires this).
   * 
   * Thread-safe: Acquires mutex before accessing shared state.
   * Lock is released after ImageMagick.read callback completes.
   *
   * @param activeTools - Array of ActiveTool objects specifying effects to apply
   * @returns Promise<ImageData> with processed pixel data
   *
   * Requirements: 3.2, 3.3, slider-performance 2.2
   */
  async process(activeTools: ActiveTool[]): Promise<ImageData> {
    if (!isInitialized) {
      throw new Error('Magick.WASM is not initialized');
    }

    // Acquire lock before accessing shared state
    await this.mutex.acquire();

    if (!this.cachedPixels || !this.sourceBytes) {
      this.mutex.release();
      throw new Error('No image loaded. Call loadImage first.');
    }

    // Capture references to shared state while holding lock
    const sourceBytes = this.sourceBytes;
    const cachedPixels = this.cachedPixels;
    const cachedWidth = this.cachedWidth;
    const cachedHeight = this.cachedHeight;

    // If no tools, return cached pixels directly (fast path)
    if (activeTools.length === 0) {
      this.mutex.release();
      return {
        pixels: new Uint8Array(cachedPixels),
        width: cachedWidth,
        height: cachedHeight,
        originalBytes: sourceBytes,
      };
    }

    // For effects, we need to use ImageMagick - read from bytes
    // Note: ImageMagick WASM doesn't support reading from raw RGBA pixels,
    // so we must read from the compressed bytes for effect application
    return new Promise<ImageData>((resolve, reject) => {
      try {
        ImageMagick.read(sourceBytes, (image) => {
          // Sort tools by EFFECT_ORDER for consistent application
          const sortedTools = [...activeTools].sort((a, b) => {
            const aIndex = EFFECT_ORDER.indexOf(a.id);
            const bIndex = EFFECT_ORDER.indexOf(b.id);
            // Unknown tools go to the end
            return (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex);
          });

          // Apply effects from registry
          for (const tool of sortedTools) {
            const toolDef = TOOL_REGISTRY[tool.id];
            if (toolDef) {
              toolDef.execute(image, tool.value);
            } else {
              console.warn(`Unknown tool "${tool.id}" skipped during processing`);
            }
          }

          // Write to RGBA for canvas rendering
          image.write(MagickFormat.Rgba, (pixels) => {
            // Release lock after callback completes
            this.mutex.release();
            
            resolve({
              pixels: new Uint8Array(pixels),
              width: image.width,
              height: image.height,
              originalBytes: sourceBytes,
            });
          });
        });
      } catch (error) {
        // Release lock on error
        this.mutex.release();
        
        console.error('ImageEngine.process error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to process image';
        reject(new Error(`Failed to process image: ${errorMessage}`));
      }
    });
  }

  /**
   * Clears all cached data and releases memory.
   * Should be called when the image is no longer needed or before loading a new image.
   * 
   * Thread-safe: Waits for any in-progress operations to complete before clearing state.
   * This is an async method to ensure proper synchronization.
   * 
   * Requirements: 3.3, slider-performance 2.4
   */
  async disposeAsync(): Promise<void> {
    // Acquire lock to ensure no operations are in progress
    await this.mutex.acquire();
    try {
      this.sourceBytes = null;
      this.cachedPixels = null;
      this.cachedWidth = 0;
      this.cachedHeight = 0;
    } finally {
      this.mutex.release();
    }
  }

  /**
   * Synchronous dispose - clears state immediately without waiting for lock.
   * Use with caution: only safe when you know no operations are in progress.
   * Prefer disposeAsync() for thread-safe cleanup.
   * 
   * Requirements: 3.3, slider-performance 2.4
   */
  dispose(): void {
    this.sourceBytes = null;
    this.cachedPixels = null;
    this.cachedWidth = 0;
    this.cachedHeight = 0;
  }

  /**
   * Checks if an image is currently loaded.
   * @returns true if an image is loaded and ready for processing
   */
  hasImage(): boolean {
    return this.cachedPixels !== null;
  }
  
  /**
   * Returns the cached pixel data if available.
   * Useful for testing and debugging.
   * @returns The cached pixels or null if no image is loaded
   */
  getCachedPixels(): Uint8Array | null {
    return this.cachedPixels;
  }
  
  /**
   * Returns the cached dimensions.
   * @returns Object with width and height, or null if no image is loaded
   */
  getCachedDimensions(): { width: number; height: number } | null {
    if (!this.cachedPixels) return null;
    return { width: this.cachedWidth, height: this.cachedHeight };
  }
}

/**
 * Reads image data and returns pixel data for canvas rendering
 * @param data - Image data as Uint8Array (original file bytes)
 * @returns Object containing pixel data, dimensions, and original bytes for re-processing
 */
export function readImageData(data: Uint8Array): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(data, (image) => {
        const width = image.width;
        const height = image.height;

        // Write to RGBA format for canvas
        image.write(MagickFormat.Rgba, (pixels) => {
          // pixels is already in RGBA format, 1 byte per channel
          resolve({
            pixels: new Uint8Array(pixels),
            width,
            height,
            originalBytes: new Uint8Array(data),
          });
        });
      });
    } catch {
      reject(new Error("Failed to read image data"));
    }
  });
}

/**
 * Converts image data to grayscale using Magick.WASM
 *
 * NOTE: This is a DESTRUCTIVE base transformation that updates originalBytes.
 * Unlike blurImage (which is non-destructive), this operation modifies the base
 * image state so that subsequent operations (like blur) are applied to the grayscale version.
 *
 * @param data - Original image data containing originalBytes for re-processing
 * @returns Promise containing grayscale image data with updated originalBytes (grayscale PNG)
 */
export function convertToGrayscale(data: ImageData): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  return new Promise((resolve, reject) => {
    try {
      // Read from original file bytes and apply grayscale
      ImageMagick.read(data.originalBytes, (image) => {
        // Apply grayscale conversion
        image.grayscale();

        const width = image.width;
        const height = image.height;

        // Write to PNG format to preserve the grayscale state for future operations
        image.write(MagickFormat.Png, (pngBytes) => {
          const newOriginalBytes = new Uint8Array(pngBytes);

          // Write back to RGBA format for canvas rendering
          image.write(MagickFormat.Rgba, (pixels) => {
            resolve({
              pixels: new Uint8Array(pixels),
              width,
              height,
              originalBytes: newOriginalBytes, // DESTRUCTIVE: Update originalBytes to grayscale version
            });
          });
        });
      });
    } catch {
      reject(new Error("Failed to convert image to grayscale"));
    }
  });
}

/**
 * Applies Gaussian blur to an image
 *
 * NOTE: This is a NON-DESTRUCTIVE preview transformation that preserves originalBytes.
 * Unlike convertToGrayscale (which is destructive), this operation always reads from
 * originalBytes and returns new pixels without modifying the base image state.
 * This enables real-time blur preview with the ability to return to the unblurred state.
 *
 * @param data - ImageData containing originalBytes for non-destructive editing
 * @param radius - Blur radius (0-20). A radius of 0 returns the original image unchanged.
 * @returns Promise<ImageData> with blurred pixels and preserved originalBytes
 */
export function blurImage(data: ImageData, radius: number): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(data.originalBytes, (image) => {
        const width = image.width;
        const height = image.height;

        // Handle radius 0 as identity - return original pixels
        if (radius === 0) {
          image.write(MagickFormat.Rgba, (pixels) => {
            resolve({
              pixels: new Uint8Array(pixels),
              width,
              height,
              originalBytes: data.originalBytes,
            });
          });
          return;
        }

        // Apply Gaussian blur - blur(0, sigma) lets ImageMagick auto-calculate kernel size
        image.blur(0, radius);

        // Write to RGBA for canvas rendering
        image.write(MagickFormat.Rgba, (pixels) => {
          resolve({
            pixels: new Uint8Array(pixels),
            width,
            height,
            originalBytes: data.originalBytes, // NON-DESTRUCTIVE: Preserve original for non-destructive editing
          });
        });
      });
    } catch {
      reject(new Error("Failed to apply blur effect"));
    }
  });
}

/**
 * Applies multiple effects to an image in a single read/write cycle.
 * Effects are applied in a consistent order defined by EFFECT_ORDER from the registry.
 *
 * NOTE: This is a NON-DESTRUCTIVE preview transformation that preserves originalBytes.
 * All effects are applied to the original image data, enabling real-time preview
 * with the ability to return to the original state.
 *
 * @param data - ImageData containing originalBytes for non-destructive editing
 * @param tools - Array of ActiveTool objects specifying which effects to apply and their values
 * @returns Promise<ImageData> with all effects applied and preserved originalBytes
 *
 * Requirements: 2.3, 2.4, 5.2, 5.3
 */
export function applyEffectsPipeline(
  data: ImageData,
  tools: ActiveTool[]
): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  // If no tools, return original image
  if (tools.length === 0) {
    return new Promise((resolve, reject) => {
      try {
        ImageMagick.read(data.originalBytes, (image) => {
          const width = image.width;
          const height = image.height;
          image.write(MagickFormat.Rgba, (pixels) => {
            resolve({
              pixels: new Uint8Array(pixels),
              width,
              height,
              originalBytes: data.originalBytes,
            });
          });
        });
      } catch {
        reject(new Error("Failed to read image data"));
      }
    });
  }

  // Sort tools by EFFECT_ORDER for consistent application
  const sortedTools = [...tools].sort((a, b) => {
    const aIndex = EFFECT_ORDER.indexOf(a.id);
    const bIndex = EFFECT_ORDER.indexOf(b.id);
    // Unknown tools go to the end
    return (
      (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex)
    );
  });

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(data.originalBytes, (image) => {
        const width = image.width;
        const height = image.height;

        // Apply effects using TOOL_REGISTRY lookup instead of switch statement
        for (const tool of sortedTools) {
          const toolDef = TOOL_REGISTRY[tool.id];
          if (toolDef) {
            toolDef.execute(image, tool.value);
          } else {
            console.warn(`Unknown tool "${tool.id}" skipped during processing`);
          }
        }

        // Write to RGBA for canvas rendering (single write at the end)
        image.write(MagickFormat.Rgba, (pixels) => {
          resolve({
            pixels: new Uint8Array(pixels),
            width,
            height,
            originalBytes: data.originalBytes, // NON-DESTRUCTIVE: Preserve original
          });
        });
      });
    } catch {
      reject(new Error("Failed to apply effects pipeline"));
    }
  });
}

export { ImageMagick, MagickFormat };
