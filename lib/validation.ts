/**
 * File validation utilities for image upload
 */

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/**
 * Maximum image dimensions allowed for processing.
 * Images larger than this will be rejected or downscaled.
 * 
 * 8K resolution (7680×4320) is the hard limit to prevent memory exhaustion.
 * A single RGBA buffer at 8K is ~132MB.
 */
export const MAX_IMAGE_DIMENSION = 7680;

/**
 * Maximum recommended dimension for processing.
 * Images larger than this should be downscaled for processing
 * and upscaled only for final export.
 * 
 * 4K resolution (3840×2160) provides a good balance between
 * quality and memory usage (~33MB per RGBA buffer).
 */
export const MAX_PROCESSING_DIMENSION = 3840;

/**
 * Maximum total pixels allowed (width × height).
 * This prevents extreme aspect ratios from bypassing dimension limits.
 * 8K equivalent: 7680 × 4320 = ~33 million pixels
 */
export const MAX_TOTAL_PIXELS = 33_177_600;

/**
 * Maximum file size in bytes (50MB).
 * Prevents loading extremely large compressed files.
 */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export interface DimensionValidationResult {
  isValid: boolean;
  error?: string;
  /** Whether the image should be downscaled for processing */
  needsDownscaling?: boolean;
  /** Suggested processing dimensions if downscaling is needed */
  suggestedDimensions?: { width: number; height: number };
}

/**
 * Validates if a file is an accepted image type and within size limits
 * @param file - The file to validate
 * @returns Validation result with error message if invalid
 */
export function validateImageFile(file: File): FileValidationResult {
  if (!file) {
    return {
      isValid: false,
      error: 'No file provided',
    };
  }

  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return {
      isValid: false,
      error: 'Please select a valid image file (PNG, JPEG, GIF, or WebP).',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    return {
      isValid: false,
      error: `File size (${sizeMB}MB) exceeds maximum allowed size (50MB).`,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Validates image dimensions and determines if downscaling is needed
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Validation result with downscaling recommendation
 */
export function validateImageDimensions(
  width: number,
  height: number
): DimensionValidationResult {
  if (width <= 0 || height <= 0) {
    return {
      isValid: false,
      error: 'Invalid image dimensions.',
    };
  }

  const totalPixels = width * height;

  // Check hard limits
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      isValid: false,
      error: `Image dimensions (${width}×${height}) exceed maximum allowed (${MAX_IMAGE_DIMENSION}×${MAX_IMAGE_DIMENSION}).`,
    };
  }

  if (totalPixels > MAX_TOTAL_PIXELS) {
    return {
      isValid: false,
      error: `Image resolution (${Math.round(totalPixels / 1_000_000)}MP) exceeds maximum allowed (~33MP).`,
    };
  }

  // Check if downscaling is recommended for processing
  if (width > MAX_PROCESSING_DIMENSION || height > MAX_PROCESSING_DIMENSION) {
    const scale = Math.min(
      MAX_PROCESSING_DIMENSION / width,
      MAX_PROCESSING_DIMENSION / height
    );
    
    return {
      isValid: true,
      needsDownscaling: true,
      suggestedDimensions: {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      },
    };
  }

  return {
    isValid: true,
    needsDownscaling: false,
  };
}

/**
 * Calculates the memory size for an RGBA buffer
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Size in bytes
 */
export function calculateRGBABufferSize(width: number, height: number): number {
  return width * height * 4; // 4 bytes per pixel (RGBA)
}

/**
 * Estimates total memory usage for an image with all buffers
 * Accounts for: sourceBytes, cachedPixels, lastProcessedResult.pixels, canvasRenderCache.imageData
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param compressedSize - Size of compressed source bytes
 * @returns Estimated total memory in bytes
 */
export function estimateImageMemoryUsage(
  width: number,
  height: number,
  compressedSize: number
): number {
  const rgbaSize = calculateRGBABufferSize(width, height);
  // sourceBytes + cachedPixels + lastProcessedResult.pixels + canvasRenderCache.imageData
  // = compressedSize + 3 × rgbaSize
  return compressedSize + (3 * rgbaSize);
}

/**
 * Checks if a MIME type is an accepted image type
 * @param mimeType - The MIME type to check
 * @returns true if the MIME type is accepted
 */
export function isAcceptedImageType(mimeType: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(mimeType as AcceptedImageType);
}
