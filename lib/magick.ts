/**
 * Magick.WASM initialization and image processing utilities
 */

import { ImageMagick, initializeImageMagick, MagickFormat } from '@imagemagick/magick-wasm';

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
 * @param data - Original image data containing originalBytes for re-processing
 * @returns Promise containing grayscale image data
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

        // Write back to RGBA format for canvas rendering
        image.write(MagickFormat.Rgba, (pixels) => {
          resolve({ 
            pixels: new Uint8Array(pixels), 
            width, 
            height,
            originalBytes: data.originalBytes // Preserve original for potential future operations
          });
        });
      });
    } catch {
      reject(new Error('Failed to convert image to grayscale'));
    }
  });
}

export { ImageMagick, MagickFormat };
