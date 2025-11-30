/**
 * Magick.WASM initialization and image processing utilities
 */

import { ImageMagick, initializeImageMagick, MagickFormat, Percentage } from '@imagemagick/magick-wasm';

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
      const wasmResponse = await fetch('/magick.wasm');
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM file: ${wasmResponse.status}`);
      }
      const wasmBytes = await wasmResponse.arrayBuffer();
      await initializeImageMagick(new Uint8Array(wasmBytes));
      isInitialized = true;
    } catch (error) {
      console.error('WASM initialization error:', error);
      initializationPromise = null;
      throw new Error('Failed to initialize image processor. Please refresh the page.');
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
 * Reads image data and returns pixel data for canvas rendering
 * @param data - Image data as Uint8Array (original file bytes)
 * @returns Object containing pixel data, dimensions, and original bytes for re-processing
 */
export function readImageData(data: Uint8Array): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error('Magick.WASM is not initialized'));
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
            originalBytes: new Uint8Array(data)
          });
        });
      });
    } catch {
      reject(new Error('Failed to read image data'));
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
    return Promise.reject(new Error('Magick.WASM is not initialized'));
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
              originalBytes: newOriginalBytes // DESTRUCTIVE: Update originalBytes to grayscale version
            });
          });
        });
      });
    } catch {
      reject(new Error('Failed to convert image to grayscale'));
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
    return Promise.reject(new Error('Magick.WASM is not initialized'));
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
              originalBytes: data.originalBytes
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
            originalBytes: data.originalBytes // NON-DESTRUCTIVE: Preserve original for non-destructive editing
          });
        });
      });
    } catch {
      reject(new Error('Failed to apply blur effect'));
    }
  });
}

import type { ActiveTool } from './types';

/**
 * Effect application order for consistent results
 * Effects are applied in this order: blur → grayscale → sepia → contrast
 */
const EFFECT_ORDER = ['blur', 'grayscale', 'sepia', 'contrast'] as const;

/**
 * Applies multiple effects to an image in a single read/write cycle.
 * Effects are applied in a consistent order: blur → grayscale → sepia → contrast
 * 
 * NOTE: This is a NON-DESTRUCTIVE preview transformation that preserves originalBytes.
 * All effects are applied to the original image data, enabling real-time preview
 * with the ability to return to the original state.
 * 
 * @param data - ImageData containing originalBytes for non-destructive editing
 * @param tools - Array of ActiveTool objects specifying which effects to apply and their values
 * @returns Promise<ImageData> with all effects applied and preserved originalBytes
 * 
 * Requirements: 5.2, 5.3
 */
export function applyEffectsPipeline(data: ImageData, tools: ActiveTool[]): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error('Magick.WASM is not initialized'));
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
              originalBytes: data.originalBytes
            });
          });
        });
      } catch {
        reject(new Error('Failed to read image data'));
      }
    });
  }

  // Create a map of tool id to value for quick lookup
  const toolValues = new Map(tools.map(t => [t.id, t.value]));

  // Sort tools by effect order for consistent application
  const sortedTools = [...tools].sort((a, b) => {
    const aIndex = EFFECT_ORDER.indexOf(a.id as typeof EFFECT_ORDER[number]);
    const bIndex = EFFECT_ORDER.indexOf(b.id as typeof EFFECT_ORDER[number]);
    return aIndex - bIndex;
  });

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(data.originalBytes, (image) => {
        const width = image.width;
        const height = image.height;

        // Apply effects in order
        for (const tool of sortedTools) {
          const value = toolValues.get(tool.id) ?? tool.value;
          
          switch (tool.id) {
            case 'blur':
              if (value > 0) {
                // Apply Gaussian blur - blur(0, sigma) lets ImageMagick auto-calculate kernel size
                image.blur(0, value);
              }
              break;
            case 'grayscale':
              if (value > 0) {
                // Apply grayscale with intensity (0-100)
                // For full grayscale at 100, partial at lower values
                if (value >= 100) {
                  image.grayscale();
                } else {
                  // Partial grayscale using modulate (reduce saturation)
                  // modulate takes Percentage objects
                  const saturation = new Percentage(100 - value);
                  image.modulate(new Percentage(100), saturation, new Percentage(100));
                }
              }
              break;
            case 'sepia':
              if (value > 0) {
                // Apply sepia tone effect
                // SepiaTone takes a Percentage threshold
                image.sepiaTone(new Percentage(value));
              }
              break;
            case 'contrast':
              if (value !== 0) {
                // Apply contrast adjustment (-100 to 100)
                // Use brightness/contrast approach for simpler API
                // Positive values increase contrast, negative decrease
                // Map -100 to 100 range to appropriate contrast values
                if (value > 0) {
                  // Increase contrast - use contrast method
                  image.contrast();
                } else {
                  // Decrease contrast - use level to reduce dynamic range
                  // This is a simplified approach
                  image.level(new Percentage(10), new Percentage(90));
                }
              }
              break;
          }
        }

        // Write to RGBA for canvas rendering
        image.write(MagickFormat.Rgba, (pixels) => {
          resolve({
            pixels: new Uint8Array(pixels),
            width,
            height,
            originalBytes: data.originalBytes // NON-DESTRUCTIVE: Preserve original
          });
        });
      });
    } catch {
      reject(new Error('Failed to apply effects pipeline'));
    }
  });
}

export { ImageMagick, MagickFormat };
