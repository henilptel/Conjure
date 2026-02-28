/**
 * Property-based tests for canvas rendering
 * **Feature: magick-wasm-grayscale, Property 3: Aspect Ratio Preservation**
 * **Validates: Requirements 3.3**
 */

import * as fc from 'fast-check';
import {
  calculateScaledDimensions,
  getAspectRatio,
  MAX_CANVAS_WIDTH,
  MAX_CANVAS_HEIGHT,
} from '@/lib/canvas';

describe('Property 3: Aspect Ratio Preservation', () => {
  /**
   * **Feature: magick-wasm-grayscale, Property 3: Aspect Ratio Preservation**
   * 
   * For any image with dimensions (width, height), when rendered to the canvas,
   * the ratio of displayed width to displayed height SHALL equal the original
   * width/height ratio (within floating-point tolerance).
   */
  it('should preserve aspect ratio for any valid image dimensions', () => {
    // Generate random positive image dimensions
    // Using min of 10 to avoid extreme aspect ratios where rounding error dominates
    const dimensionArb = fc.integer({ min: 10, max: 10000 });

    fc.assert(
      fc.property(dimensionArb, dimensionArb, (originalWidth, originalHeight) => {
        const originalAspectRatio = getAspectRatio(originalWidth, originalHeight);
        const scaled = calculateScaledDimensions(originalWidth, originalHeight);
        
        // Skip if dimensions are invalid (shouldn't happen with our constraints)
        if (scaled.width === 0 || scaled.height === 0) {
          return true;
        }
        
        const scaledAspectRatio = getAspectRatio(scaled.width, scaled.height);
        
        // Calculate dynamic tolerance based on scaled dimensions
        // Rounding error is bounded by 1/min(scaled.width, scaled.height)
        // We add a small buffer for floating-point precision
        const minScaledDim = Math.min(scaled.width, scaled.height);
        const maxRoundingError = 1 / minScaledDim;
        const tolerance = maxRoundingError + 0.001; // Add small buffer for FP precision
        
        const ratioDifference = Math.abs(originalAspectRatio - scaledAspectRatio);
        const relativeError = ratioDifference / originalAspectRatio;
        
        expect(relativeError).toBeLessThan(tolerance);
      }),
      { numRuns: 100 }
    );
  });

  it('should not exceed maximum canvas dimensions', () => {
    const dimensionArb = fc.integer({ min: 1, max: 10000 });

    fc.assert(
      fc.property(dimensionArb, dimensionArb, (originalWidth, originalHeight) => {
        const scaled = calculateScaledDimensions(originalWidth, originalHeight);
        
        expect(scaled.width).toBeLessThanOrEqual(MAX_CANVAS_WIDTH);
        expect(scaled.height).toBeLessThanOrEqual(MAX_CANVAS_HEIGHT);
      }),
      { numRuns: 100 }
    );
  });

  it('should not scale up images smaller than max dimensions', () => {
    // Generate dimensions that are within max bounds
    const smallWidthArb = fc.integer({ min: 1, max: MAX_CANVAS_WIDTH });
    const smallHeightArb = fc.integer({ min: 1, max: MAX_CANVAS_HEIGHT });

    fc.assert(
      fc.property(smallWidthArb, smallHeightArb, (originalWidth, originalHeight) => {
        const scaled = calculateScaledDimensions(originalWidth, originalHeight);
        
        // Images within bounds should not be scaled up
        expect(scaled.width).toBeLessThanOrEqual(originalWidth);
        expect(scaled.height).toBeLessThanOrEqual(originalHeight);
        expect(scaled.scale).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  it('should return zero dimensions for invalid input', () => {
    const invalidDimensionArb = fc.integer({ min: -1000, max: 0 });

    fc.assert(
      fc.property(invalidDimensionArb, fc.integer({ min: 1, max: 1000 }), (invalidDim, validDim) => {
        // Test with invalid width
        const result1 = calculateScaledDimensions(invalidDim, validDim);
        expect(result1.width).toBe(0);
        expect(result1.height).toBe(0);
        expect(result1.scale).toBe(0);

        // Test with invalid height
        const result2 = calculateScaledDimensions(validDim, invalidDim);
        expect(result2.width).toBe(0);
        expect(result2.height).toBe(0);
        expect(result2.scale).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});
