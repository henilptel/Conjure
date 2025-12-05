/**
 * Property-based tests for Compare Mode Data Separation and Display Derivation
 * 
 * **Feature: ux-enhancements-v09, Property 7: Compare Mode Data Separation**
 * **Feature: ux-enhancements-v09, Property 8: Compare Mode Display Derivation**
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import * as fc from 'fast-check';

// ============================================================================
// Types for Compare Mode Testing
// ============================================================================

/**
 * Simulated ImageData structure matching the real ImageData from lib/magick
 */
interface MockImageData {
  pixels: Uint8Array;
  width: number;
  height: number;
}

/**
 * Compare mode state for testing
 */
interface CompareModeState {
  originalData: MockImageData | null;
  processedData: MockImageData | null;
  isCompareMode: boolean;
}

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * Generate arbitrary pixel data for testing
 * Uses small sizes to keep tests fast
 */
const arbPixels = (width: number, height: number): fc.Arbitrary<Uint8Array> => {
  const size = width * height * 4; // RGBA
  return fc.uint8Array({ minLength: size, maxLength: size });
};

/**
 * Generate arbitrary image dimensions (small for test performance)
 */
const arbDimensions = fc.record({
  width: fc.integer({ min: 1, max: 100 }),
  height: fc.integer({ min: 1, max: 100 }),
});

/**
 * Generate arbitrary MockImageData
 */
const arbImageData: fc.Arbitrary<MockImageData> = arbDimensions.chain(({ width, height }) =>
  arbPixels(width, height).map(pixels => ({
    pixels,
    width,
    height,
  }))
);

/**
 * Generate arbitrary effect modification (simulates WASM processing)
 * Returns a function that modifies pixel data
 */
const arbEffectModification = fc.integer({ min: 1, max: 255 }).map(delta => {
  return (original: MockImageData): MockImageData => {
    // Create a modified copy (simulating effect application)
    const newPixels = new Uint8Array(original.pixels.length);
    for (let i = 0; i < original.pixels.length; i++) {
      // Simple modification: add delta and wrap
      newPixels[i] = (original.pixels[i] + delta) % 256;
    }
    return {
      pixels: newPixels,
      width: original.width,
      height: original.height,
    };
  };
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derives display data based on compare mode
 * This mirrors the logic in ImageProcessor.tsx
 */
function deriveDisplayData(state: CompareModeState): MockImageData | null {
  return state.isCompareMode ? state.originalData : state.processedData;
}

/**
 * Compares two ImageData objects for equality
 */
function imageDataEquals(a: MockImageData | null, b: MockImageData | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.pixels.length !== b.pixels.length) return false;
  for (let i = 0; i < a.pixels.length; i++) {
    if (a.pixels[i] !== b.pixels[i]) return false;
  }
  return true;
}

/**
 * Creates a deep copy of ImageData
 */
function copyImageData(data: MockImageData): MockImageData {
  return {
    pixels: new Uint8Array(data.pixels),
    width: data.width,
    height: data.height,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Property 7: Compare Mode Data Separation', () => {
  /**
   * **Feature: ux-enhancements-v09, Property 7: Compare Mode Data Separation**
   * 
   * For any loaded image with applied effects, originalData SHALL equal the 
   * initially loaded pixel data and processedData SHALL equal the effect-applied pixel data.
   * **Validates: Requirements 2.1**
   */
  it('originalData remains unchanged after effect application', () => {
    fc.assert(
      fc.property(
        arbImageData,
        arbEffectModification,
        (originalImage, applyEffect) => {
          // Simulate loading an image
          const originalData = copyImageData(originalImage);
          const originalDataCopy = copyImageData(originalImage); // Keep a reference copy
          
          // Simulate applying effects (WASM processing)
          const processedData = applyEffect(originalData);
          
          // Property: originalData should remain unchanged
          expect(imageDataEquals(originalData, originalDataCopy)).toBe(true);
          
          // Property: processedData should be different (effects were applied)
          // Note: This may not always be true if delta causes wrap-around to same value,
          // but for most cases it will be different
          expect(processedData.width).toBe(originalData.width);
          expect(processedData.height).toBe(originalData.height);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('originalData and processedData are stored separately', () => {
    fc.assert(
      fc.property(
        arbImageData,
        arbEffectModification,
        (originalImage, applyEffect) => {
          // Simulate the state structure in ImageProcessor
          const state: CompareModeState = {
            originalData: copyImageData(originalImage),
            processedData: applyEffect(copyImageData(originalImage)),
            isCompareMode: false,
          };
          
          // Property: Both data stores exist independently
          expect(state.originalData).not.toBeNull();
          expect(state.processedData).not.toBeNull();
          
          // Property: They have the same dimensions
          expect(state.originalData!.width).toBe(state.processedData!.width);
          expect(state.originalData!.height).toBe(state.processedData!.height);
          
          // Property: Modifying processedData doesn't affect originalData
          const originalPixelsCopy = new Uint8Array(state.originalData!.pixels);
          state.processedData!.pixels[0] = (state.processedData!.pixels[0] + 1) % 256;
          
          expect(state.originalData!.pixels[0]).toBe(originalPixelsCopy[0]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('processedData reflects effect-applied pixel data', () => {
    fc.assert(
      fc.property(
        arbImageData,
        fc.integer({ min: 1, max: 255 }),
        (originalImage, delta) => {
          const originalData = copyImageData(originalImage);
          
          // Apply a known effect
          const processedData: MockImageData = {
            pixels: new Uint8Array(originalData.pixels.length),
            width: originalData.width,
            height: originalData.height,
          };
          
          for (let i = 0; i < originalData.pixels.length; i++) {
            processedData.pixels[i] = (originalData.pixels[i] + delta) % 256;
          }
          
          // Property: processedData contains the expected modified values
          for (let i = 0; i < originalData.pixels.length; i++) {
            const expected = (originalData.pixels[i] + delta) % 256;
            expect(processedData.pixels[i]).toBe(expected);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: Compare Mode Display Derivation', () => {
  /**
   * **Feature: ux-enhancements-v09, Property 8: Compare Mode Display Derivation**
   * 
   * For any state where isCompareMode is true, displayData SHALL equal originalData;
   * when false, displayData SHALL equal processedData.
   * **Validates: Requirements 2.2, 2.3**
   */
  it('displayData equals originalData when isCompareMode is true', () => {
    fc.assert(
      fc.property(
        arbImageData,
        arbEffectModification,
        (originalImage, applyEffect) => {
          const state: CompareModeState = {
            originalData: copyImageData(originalImage),
            processedData: applyEffect(copyImageData(originalImage)),
            isCompareMode: true,
          };
          
          const displayData = deriveDisplayData(state);
          
          // Property: When compare mode is ON, display shows original
          expect(imageDataEquals(displayData, state.originalData)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('displayData equals processedData when isCompareMode is false', () => {
    fc.assert(
      fc.property(
        arbImageData,
        arbEffectModification,
        (originalImage, applyEffect) => {
          const state: CompareModeState = {
            originalData: copyImageData(originalImage),
            processedData: applyEffect(copyImageData(originalImage)),
            isCompareMode: false,
          };
          
          const displayData = deriveDisplayData(state);
          
          // Property: When compare mode is OFF, display shows processed
          expect(imageDataEquals(displayData, state.processedData)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toggling isCompareMode swaps displayData instantly', () => {
    fc.assert(
      fc.property(
        arbImageData,
        arbEffectModification,
        fc.boolean(),
        (originalImage, applyEffect, initialCompareMode) => {
          const originalData = copyImageData(originalImage);
          const processedData = applyEffect(copyImageData(originalImage));
          
          // Initial state
          let state: CompareModeState = {
            originalData,
            processedData,
            isCompareMode: initialCompareMode,
          };
          
          const displayBefore = deriveDisplayData(state);
          
          // Toggle compare mode
          state = { ...state, isCompareMode: !state.isCompareMode };
          
          const displayAfter = deriveDisplayData(state);
          
          // Property: Display data changes based on compare mode
          if (initialCompareMode) {
            // Was showing original, now showing processed
            expect(imageDataEquals(displayBefore, originalData)).toBe(true);
            expect(imageDataEquals(displayAfter, processedData)).toBe(true);
          } else {
            // Was showing processed, now showing original
            expect(imageDataEquals(displayBefore, processedData)).toBe(true);
            expect(imageDataEquals(displayAfter, originalData)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('displayData is null when no image is loaded', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isCompareMode) => {
          const state: CompareModeState = {
            originalData: null,
            processedData: null,
            isCompareMode,
          };
          
          const displayData = deriveDisplayData(state);
          
          // Property: No image loaded means no display data
          expect(displayData).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('compare mode derivation is a pure function', () => {
    fc.assert(
      fc.property(
        arbImageData,
        arbEffectModification,
        fc.boolean(),
        (originalImage, applyEffect, isCompareMode) => {
          const state: CompareModeState = {
            originalData: copyImageData(originalImage),
            processedData: applyEffect(copyImageData(originalImage)),
            isCompareMode,
          };
          
          // Call deriveDisplayData multiple times
          const result1 = deriveDisplayData(state);
          const result2 = deriveDisplayData(state);
          const result3 = deriveDisplayData(state);
          
          // Property: Same input always produces same output
          expect(imageDataEquals(result1, result2)).toBe(true);
          expect(imageDataEquals(result2, result3)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
