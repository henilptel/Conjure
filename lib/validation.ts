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

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates if a file is an accepted image type
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

  return {
    isValid: true,
  };
}

/**
 * Checks if a MIME type is an accepted image type
 * @param mimeType - The MIME type to check
 * @returns true if the MIME type is accepted
 */
export function isAcceptedImageType(mimeType: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(mimeType as AcceptedImageType);
}
