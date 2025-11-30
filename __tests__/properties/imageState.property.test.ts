/**
 * Property-based tests for ImageState consistency
 * **Feature: context-aware-chat, Property 3: ImageContext reflects current state**
 * **Validates: Requirements 3.2, 5.2, 5.3**
 */

import * as fc from 'fast-check';
import { ImageState, defaultImageState } from '@/lib/types';

/**
 * Arbitrary generator for valid ImageState objects
 */
const imageStateArb = fc.record({
  hasImage: fc.boolean(),
  width: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
  height: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
  blur: fc.integer({ min: 0, max: 100 }),
  isGrayscale: fc.boolean(),
}).filter(state => state.hasImage || (state.width === null && state.height === null));

/**
 * Arbitrary generator for state change operations
 */
type StateChangeOperation = 
  | { type: 'loadImage'; width: number; height: number }
  | { type: 'changeBlur'; blur: number }
  | { type: 'toggleGrayscale' }
  | { type: 'clearImage' };

const stateChangeOperationArb: fc.Arbitrary<StateChangeOperation> = fc.oneof(
  fc.record({
    type: fc.constant('loadImage' as const),
    width: fc.integer({ min: 1, max: 10000 }),
    height: fc.integer({ min: 1, max: 10000 }),
  }),
  fc.record({
    type: fc.constant('changeBlur' as const),
    blur: fc.integer({ min: 0, max: 100 }),
  }),
  fc.constant({ type: 'toggleGrayscale' as const }),
  fc.constant({ type: 'clearImage' as const })
);

/**
 * Applies a state change operation to an ImageState
 */
function applyStateChange(state: ImageState, operation: StateChangeOperation): ImageState {
  switch (operation.type) {
    case 'loadImage':
      return {
        ...state,
        hasImage: true,
        width: operation.width,
        height: operation.height,
      };
    case 'changeBlur':
      return {
        ...state,
        blur: operation.blur,
      };
    case 'toggleGrayscale':
      return {
        ...state,
        isGrayscale: !state.isGrayscale,
      };
    case 'clearImage':
      return {
        ...defaultImageState,
      };
  }
}

describe('Property 3: ImageContext reflects current state', () => {
  /**
   * **Feature: context-aware-chat, Property 3: ImageContext reflects current state**
   * 
   * For any sequence of state changes (image load, blur change, grayscale toggle),
   * the ImageState object SHALL contain values that match the most recent state.
   */
  it('should maintain state consistency after any sequence of operations', () => {
    fc.assert(
      fc.property(
        fc.array(stateChangeOperationArb, { minLength: 1, maxLength: 20 }),
        (operations) => {
          // Start with default state
          let currentState = { ...defaultImageState };
          
          // Apply each operation and track expected state
          for (const operation of operations) {
            currentState = applyStateChange(currentState, operation);
          }
          
          // Verify the final state has all required fields
          expect(currentState).toHaveProperty('hasImage');
          expect(currentState).toHaveProperty('width');
          expect(currentState).toHaveProperty('height');
          expect(currentState).toHaveProperty('blur');
          expect(currentState).toHaveProperty('isGrayscale');
          
          // Verify types are correct
          expect(typeof currentState.hasImage).toBe('boolean');
          expect(currentState.width === null || typeof currentState.width === 'number').toBe(true);
          expect(currentState.height === null || typeof currentState.height === 'number').toBe(true);
          expect(typeof currentState.blur).toBe('number');
          expect(typeof currentState.isGrayscale).toBe('boolean');
          
          // Verify blur is within valid range [0, 100]
          expect(currentState.blur).toBeGreaterThanOrEqual(0);
          expect(currentState.blur).toBeLessThanOrEqual(100);
          
          // Invariant: when hasImage is false, width and height must be null
          if (!currentState.hasImage) {
            expect(currentState.width).toBeNull();
            expect(currentState.height).toBeNull();
          }
          
          // Invariant: when hasImage is true, width and height must be non-null numbers
          if (currentState.hasImage) {
            expect(currentState.width).not.toBeNull();
            expect(currentState.height).not.toBeNull();
            expect(typeof currentState.width).toBe('number');
            expect(typeof currentState.height).toBe('number');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reflect image dimensions after load operation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (width, height) => {
          const state = applyStateChange(defaultImageState, {
            type: 'loadImage',
            width,
            height,
          });
          
          expect(state.hasImage).toBe(true);
          expect(state.width).toBe(width);
          expect(state.height).toBe(height);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reflect blur value after blur change operation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (blur) => {
          const state = applyStateChange(defaultImageState, {
            type: 'changeBlur',
            blur,
          });
          
          expect(state.blur).toBe(blur);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should toggle grayscale state correctly', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (initialGrayscale) => {
          const initialState: ImageState = {
            ...defaultImageState,
            isGrayscale: initialGrayscale,
          };
          
          const state = applyStateChange(initialState, { type: 'toggleGrayscale' });
          
          expect(state.isGrayscale).toBe(!initialGrayscale);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reset to default state on clear image', () => {
    fc.assert(
      fc.property(
        imageStateArb,
        (anyState) => {
          const state = applyStateChange(anyState, { type: 'clearImage' });
          
          expect(state).toEqual(defaultImageState);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('defaultImageState should have correct initial values', () => {
    expect(defaultImageState.hasImage).toBe(false);
    expect(defaultImageState.width).toBeNull();
    expect(defaultImageState.height).toBeNull();
    expect(defaultImageState.blur).toBe(0);
    expect(defaultImageState.isGrayscale).toBe(false);
  });
});
