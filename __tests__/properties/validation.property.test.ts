/**
 * Property-based tests for file validation
 * **Feature: magick-wasm-grayscale, Property 2: Non-Image File Rejection**
 * **Validates: Requirements 2.3**
 */

import * as fc from 'fast-check';
import { validateImageFile, ACCEPTED_IMAGE_TYPES, isAcceptedImageType } from '@/lib/validation';

// Common non-image MIME types to test against
const NON_IMAGE_MIME_TYPES = [
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/pdf',
  'application/zip',
  'application/octet-stream',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/webm',
  'font/woff',
  'font/woff2',
];

/**
 * Creates a mock File object with the given MIME type
 */
function createMockFile(mimeType: string, name: string = 'test-file'): File {
  const blob = new Blob(['test content'], { type: mimeType });
  return new File([blob], name, { type: mimeType });
}

describe('Property 2: Non-Image File Rejection', () => {
  /**
   * **Feature: magick-wasm-grayscale, Property 2: Non-Image File Rejection**
   * 
   * For any file with a MIME type not in the accepted image types list 
   * (PNG, JPEG, GIF, WebP), the system SHALL reject the file and the 
   * application state SHALL remain unchanged.
   */
  it('should reject any file with a non-image MIME type', () => {
    // Generate random non-image MIME types
    const nonImageMimeTypeArb = fc.oneof(
      // Use known non-image MIME types
      fc.constantFrom(...NON_IMAGE_MIME_TYPES),
      // Generate random MIME types that are not in accepted list
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]+$/.test(s))
      ).map(([type, subtype]) => `${type}/${subtype}`)
        .filter(mimeType => !ACCEPTED_IMAGE_TYPES.includes(mimeType as typeof ACCEPTED_IMAGE_TYPES[number]))
    );

    fc.assert(
      fc.property(nonImageMimeTypeArb, (mimeType) => {
        const file = createMockFile(mimeType);
        const result = validateImageFile(file);
        
        // The file should be rejected (isValid should be false)
        expect(result.isValid).toBe(false);
        // An error message should be provided
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept all valid image MIME types', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ACCEPTED_IMAGE_TYPES), (mimeType) => {
        const file = createMockFile(mimeType);
        const result = validateImageFile(file);
        
        // The file should be accepted (isValid should be true)
        expect(result.isValid).toBe(true);
        // No error message should be present
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('isAcceptedImageType should return false for non-image MIME types', () => {
    const nonImageMimeTypeArb = fc.oneof(
      fc.constantFrom(...NON_IMAGE_MIME_TYPES),
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]+$/.test(s))
      ).map(([type, subtype]) => `${type}/${subtype}`)
        .filter(mimeType => !ACCEPTED_IMAGE_TYPES.includes(mimeType as typeof ACCEPTED_IMAGE_TYPES[number]))
    );

    fc.assert(
      fc.property(nonImageMimeTypeArb, (mimeType) => {
        expect(isAcceptedImageType(mimeType)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
