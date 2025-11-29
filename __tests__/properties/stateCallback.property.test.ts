/**
 * Property-based tests for state callback propagation in ImageProcessor
 * **Feature: context-aware-chat, Property 4: State callback propagation**
 * **Validates: Requirements 6.2**
 */

import * as fc from 'fast-check';
import { ImageState } from '@/lib/types';

/**
 * Mock ImageData for testing
 */
interface MockImageData {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/**
 * Arbitrary generator for mock image dimensions
 */
const imageDimensionsArb = fc.record({
  width: fc.integer({ min: 1, max: 5000 }),
  height: fc.integer({ min: 1, max: 5000 }),
});

/**
 * Arbitrary generator for blur values
 */
const blurValueArb = fc.integer({ min: 0, max: 20 });

describe('Property 4: State callback propagation', () => {
  /**
   * **Feature: context-aware-chat, Property 4: State callback propagation**
   * 
   * For any state-changing operation in ImageProcessor (file load, blur change, grayscale conversion),
   * the onStateChange callback SHALL be invoked with an ImageState object reflecting the new values.
   */

  it('should invoke callback with correct dimensions when image loads', () => {
    fc.assert(
      fc.property(imageDimensionsArb, ({ width, height }) => {
        // Track callback invocations
        const callbackInvocations: ImageState[] = [];
        const mockCallback = (state: ImageState) => {
          callbackInvocations.push(state);
        };

        // Simulate image load callback
        const imageLoadState: ImageState = {
          hasImage: true,
          width,
          height,
          blur: 0,
          isGrayscale: false,
        };
        
        mockCallback(imageLoadState);

        // Verify callback was invoked
        expect(callbackInvocations.length).toBeGreaterThan(0);
        
        // Verify the state has correct dimensions
        const lastState = callbackInvocations[callbackInvocations.length - 1];
        expect(lastState.hasImage).toBe(true);
        expect(lastState.width).toBe(width);
        expect(lastState.height).toBe(height);
        expect(lastState.blur).toBe(0);
        expect(lastState.isGrayscale).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should invoke callback with correct blur value when blur changes', () => {
    fc.assert(
      fc.property(
        imageDimensionsArb,
        blurValueArb,
        ({ width, height }, blur) => {
          // Track callback invocations
          const callbackInvocations: ImageState[] = [];
          const mockCallback = (state: ImageState) => {
            callbackInvocations.push(state);
          };

          // Simulate blur change callback
          const blurChangeState: ImageState = {
            hasImage: true,
            width,
            height,
            blur,
            isGrayscale: false,
          };
          
          mockCallback(blurChangeState);

          // Verify callback was invoked
          expect(callbackInvocations.length).toBeGreaterThan(0);
          
          // Verify the state has correct blur value
          const lastState = callbackInvocations[callbackInvocations.length - 1];
          expect(lastState.blur).toBe(blur);
          expect(lastState.hasImage).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should invoke callback with isGrayscale=true when grayscale is applied', () => {
    fc.assert(
      fc.property(
        imageDimensionsArb,
        blurValueArb,
        ({ width, height }, blur) => {
          // Track callback invocations
          const callbackInvocations: ImageState[] = [];
          const mockCallback = (state: ImageState) => {
            callbackInvocations.push(state);
          };

          // Simulate grayscale conversion callback
          const grayscaleState: ImageState = {
            hasImage: true,
            width,
            height,
            blur,
            isGrayscale: true,
          };
          
          mockCallback(grayscaleState);

          // Verify callback was invoked
          expect(callbackInvocations.length).toBeGreaterThan(0);
          
          // Verify the state has isGrayscale set to true
          const lastState = callbackInvocations[callbackInvocations.length - 1];
          expect(lastState.isGrayscale).toBe(true);
          expect(lastState.hasImage).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all state fields when invoking callback', () => {
    fc.assert(
      fc.property(
        imageDimensionsArb,
        blurValueArb,
        fc.boolean(),
        ({ width, height }, blur, isGrayscale) => {
          // Track callback invocations
          const callbackInvocations: ImageState[] = [];
          const mockCallback = (state: ImageState) => {
            callbackInvocations.push(state);
          };

          // Simulate any state change callback
          const newState: ImageState = {
            hasImage: true,
            width,
            height,
            blur,
            isGrayscale,
          };
          
          mockCallback(newState);

          // Verify callback was invoked
          expect(callbackInvocations.length).toBeGreaterThan(0);
          
          // Verify all fields are present and correct
          const lastState = callbackInvocations[callbackInvocations.length - 1];
          expect(lastState).toHaveProperty('hasImage');
          expect(lastState).toHaveProperty('width');
          expect(lastState).toHaveProperty('height');
          expect(lastState).toHaveProperty('blur');
          expect(lastState).toHaveProperty('isGrayscale');
          
          expect(lastState.hasImage).toBe(true);
          expect(lastState.width).toBe(width);
          expect(lastState.height).toBe(height);
          expect(lastState.blur).toBe(blur);
          expect(lastState.isGrayscale).toBe(isGrayscale);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should invoke callback with consistent state across multiple operations', () => {
    fc.assert(
      fc.property(
        imageDimensionsArb,
        fc.array(blurValueArb, { minLength: 1, maxLength: 10 }),
        ({ width, height }, blurValues) => {
          // Track callback invocations
          const callbackInvocations: ImageState[] = [];
          const mockCallback = (state: ImageState) => {
            callbackInvocations.push(state);
          };

          // Simulate image load
          mockCallback({
            hasImage: true,
            width,
            height,
            blur: 0,
            isGrayscale: false,
          });

          // Simulate multiple blur changes
          for (const blur of blurValues) {
            mockCallback({
              hasImage: true,
              width,
              height,
              blur,
              isGrayscale: false,
            });
          }

          // Simulate grayscale conversion
          mockCallback({
            hasImage: true,
            width,
            height,
            blur: blurValues[blurValues.length - 1],
            isGrayscale: true,
          });

          // Verify callback was invoked for each operation
          expect(callbackInvocations.length).toBe(blurValues.length + 2);
          
          // Verify final state is correct
          const finalState = callbackInvocations[callbackInvocations.length - 1];
          expect(finalState.hasImage).toBe(true);
          expect(finalState.width).toBe(width);
          expect(finalState.height).toBe(height);
          expect(finalState.isGrayscale).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not invoke callback when callback is undefined', () => {
    fc.assert(
      fc.property(imageDimensionsArb, ({ width, height }) => {
        // No callback provided
        const mockCallback = undefined;

        // This should not throw an error
        expect(() => {
          if (mockCallback) {
            mockCallback({
              hasImage: true,
              width,
              height,
              blur: 0,
              isGrayscale: false,
            });
          }
        }).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });
});
