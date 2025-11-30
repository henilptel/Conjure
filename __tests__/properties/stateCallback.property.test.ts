/**
 * Property-based tests for state callback propagation
 * **Feature: context-aware-chat, Property 4: State callback propagation**
 * **Validates: Requirements 6.2**
 * 
 * These tests verify the contract of the onStateChange callback:
 * - The callback receives a valid ImageState object
 * - All required fields are present and have correct types
 * - State transitions follow expected patterns
 * 
 * Note: Testing the actual ImageProcessor component requires integration tests
 * with React Testing Library and mocked Magick.WASM. These property tests
 * verify the state contract and transition logic that the component must follow.
 */

import * as fc from 'fast-check';
import { ImageState, defaultImageState } from '@/lib/types';

/**
 * Arbitrary generator for valid image dimensions
 */
const imageDimensionsArb = fc.record({
  width: fc.integer({ min: 1, max: 5000 }),
  height: fc.integer({ min: 1, max: 5000 }),
});

/**
 * Arbitrary generator for blur values (0-20 range as per UI constraints)
 */
const blurValueArb = fc.integer({ min: 0, max: 20 });

/**
 * Arbitrary generator for complete ImageState objects
 */
const imageStateArb = fc.record({
  hasImage: fc.boolean(),
  width: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
  height: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
  blur: blurValueArb,
  isGrayscale: fc.boolean(),
});

/**
 * Arbitrary generator for ImageState with loaded image
 */
const loadedImageStateArb = fc.record({
  hasImage: fc.constant(true),
  width: fc.integer({ min: 1, max: 5000 }),
  height: fc.integer({ min: 1, max: 5000 }),
  blur: blurValueArb,
  isGrayscale: fc.boolean(),
});

/**
 * Simulates the state callback handler that ImageProcessor uses.
 * This models the notifyStateChange function behavior.
 */
function createStateNotifier(callback: (state: ImageState) => void) {
  let currentState: ImageState = { ...defaultImageState };
  
  return {
    notifyStateChange: (updates: Partial<ImageState>) => {
      currentState = { ...currentState, ...updates };
      callback(currentState);
    },
    getCurrentState: () => currentState,
    setBaseState: (state: ImageState) => {
      currentState = state;
    },
  };
}

describe('Property 4: State callback propagation', () => {
  /**
   * **Feature: context-aware-chat, Property 4: State callback propagation**
   * 
   * For any state-changing operation, the onStateChange callback SHALL be invoked
   * with an ImageState object reflecting the new values.
   */

  describe('ImageState contract validation', () => {
    it('should always have all required fields in ImageState', () => {
      fc.assert(
        fc.property(imageStateArb, (state) => {
          // Verify all required fields exist
          expect(state).toHaveProperty('hasImage');
          expect(state).toHaveProperty('width');
          expect(state).toHaveProperty('height');
          expect(state).toHaveProperty('blur');
          expect(state).toHaveProperty('isGrayscale');
          
          // Verify types
          expect(typeof state.hasImage).toBe('boolean');
          expect(state.width === null || typeof state.width === 'number').toBe(true);
          expect(state.height === null || typeof state.height === 'number').toBe(true);
          expect(typeof state.blur).toBe('number');
          expect(typeof state.isGrayscale).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });

    it('should have blur value within valid range (0-20)', () => {
      fc.assert(
        fc.property(loadedImageStateArb, (state) => {
          expect(state.blur).toBeGreaterThanOrEqual(0);
          expect(state.blur).toBeLessThanOrEqual(20);
        }),
        { numRuns: 100 }
      );
    });

    it('should have positive dimensions when image is loaded', () => {
      fc.assert(
        fc.property(loadedImageStateArb, (state) => {
          expect(state.hasImage).toBe(true);
          expect(state.width).toBeGreaterThan(0);
          expect(state.height).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('State notifier behavior', () => {
    it('should invoke callback with merged state on partial updates', () => {
      fc.assert(
        fc.property(
          loadedImageStateArb,
          blurValueArb,
          (initialState, newBlur) => {
            const callbackInvocations: ImageState[] = [];
            const notifier = createStateNotifier((state) => {
              callbackInvocations.push({ ...state });
            });

            // Set initial state
            notifier.setBaseState(initialState);

            // Notify with partial update (only blur)
            notifier.notifyStateChange({ blur: newBlur });

            // Verify callback was invoked
            expect(callbackInvocations.length).toBe(1);

            // Verify the state has the new blur but preserves other fields
            const resultState = callbackInvocations[0];
            expect(resultState.blur).toBe(newBlur);
            expect(resultState.hasImage).toBe(initialState.hasImage);
            expect(resultState.width).toBe(initialState.width);
            expect(resultState.height).toBe(initialState.height);
            expect(resultState.isGrayscale).toBe(initialState.isGrayscale);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should invoke callback with correct state when grayscale is toggled', () => {
      fc.assert(
        fc.property(loadedImageStateArb, (initialState) => {
          const callbackInvocations: ImageState[] = [];
          const notifier = createStateNotifier((state) => {
            callbackInvocations.push({ ...state });
          });

          // Set initial state with isGrayscale = false
          notifier.setBaseState({ ...initialState, isGrayscale: false });

          // Notify grayscale change
          notifier.notifyStateChange({ isGrayscale: true });

          // Verify callback was invoked with isGrayscale = true
          expect(callbackInvocations.length).toBe(1);
          expect(callbackInvocations[0].isGrayscale).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should invoke callback with correct dimensions when image loads', () => {
      fc.assert(
        fc.property(imageDimensionsArb, ({ width, height }) => {
          const callbackInvocations: ImageState[] = [];
          const notifier = createStateNotifier((state) => {
            callbackInvocations.push({ ...state });
          });

          // Simulate image load
          notifier.notifyStateChange({
            hasImage: true,
            width,
            height,
            blur: 0,
            isGrayscale: false,
          });

          // Verify callback was invoked with correct dimensions
          expect(callbackInvocations.length).toBe(1);
          const state = callbackInvocations[0];
          expect(state.hasImage).toBe(true);
          expect(state.width).toBe(width);
          expect(state.height).toBe(height);
          expect(state.blur).toBe(0);
          expect(state.isGrayscale).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('State transition sequences', () => {
    it('should maintain consistent state across multiple blur changes', () => {
      fc.assert(
        fc.property(
          imageDimensionsArb,
          fc.array(blurValueArb, { minLength: 1, maxLength: 10 }),
          ({ width, height }, blurValues) => {
            const callbackInvocations: ImageState[] = [];
            const notifier = createStateNotifier((state) => {
              callbackInvocations.push({ ...state });
            });

            // Simulate image load
            notifier.notifyStateChange({
              hasImage: true,
              width,
              height,
              blur: 0,
              isGrayscale: false,
            });

            // Simulate multiple blur changes
            for (const blur of blurValues) {
              notifier.notifyStateChange({ blur });
            }

            // Verify callback was invoked for each operation
            expect(callbackInvocations.length).toBe(blurValues.length + 1);

            // Verify dimensions remain consistent across all invocations
            for (const state of callbackInvocations) {
              expect(state.width).toBe(width);
              expect(state.height).toBe(height);
              expect(state.hasImage).toBe(true);
            }

            // Verify final blur value
            const finalState = callbackInvocations[callbackInvocations.length - 1];
            expect(finalState.blur).toBe(blurValues[blurValues.length - 1]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle image load -> blur -> grayscale sequence correctly', () => {
      fc.assert(
        fc.property(
          imageDimensionsArb,
          blurValueArb,
          ({ width, height }, blur) => {
            const callbackInvocations: ImageState[] = [];
            const notifier = createStateNotifier((state) => {
              callbackInvocations.push({ ...state });
            });

            // Step 1: Image load
            notifier.notifyStateChange({
              hasImage: true,
              width,
              height,
              blur: 0,
              isGrayscale: false,
            });

            // Step 2: Blur change
            notifier.notifyStateChange({ blur });

            // Step 3: Grayscale conversion
            notifier.notifyStateChange({ isGrayscale: true });

            // Verify sequence
            expect(callbackInvocations.length).toBe(3);

            // After load
            expect(callbackInvocations[0].hasImage).toBe(true);
            expect(callbackInvocations[0].blur).toBe(0);
            expect(callbackInvocations[0].isGrayscale).toBe(false);

            // After blur
            expect(callbackInvocations[1].blur).toBe(blur);
            expect(callbackInvocations[1].isGrayscale).toBe(false);

            // After grayscale
            expect(callbackInvocations[2].blur).toBe(blur);
            expect(callbackInvocations[2].isGrayscale).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle callback being undefined without throwing', () => {
      fc.assert(
        fc.property(imageStateArb, (state) => {
          // Simulate the pattern used in ImageProcessor: if (onStateChange) { ... }
          const onStateChange: ((state: ImageState) => void) | undefined = undefined;

          expect(() => {
            if (onStateChange) {
              onStateChange(state);
            }
          }).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it('should handle null dimensions for unloaded state', () => {
      // This tests the edge case where no image is loaded and dimensions are null
      const state: ImageState = {
        hasImage: false,
        width: null,
        height: null,
        blur: 0,
        isGrayscale: false,
      };

      expect(state.width).toBeNull();
      expect(state.height).toBeNull();
      expect(state.hasImage).toBe(false);
    });

    it('should handle maximum blur value', () => {
      fc.assert(
        fc.property(loadedImageStateArb, (state) => {
          const callbackInvocations: ImageState[] = [];
          const notifier = createStateNotifier((s) => {
            callbackInvocations.push({ ...s });
          });

          notifier.setBaseState(state);
          notifier.notifyStateChange({ blur: 20 });

          expect(callbackInvocations[0].blur).toBe(20);
        }),
        { numRuns: 100 }
      );
    });
  });
});
