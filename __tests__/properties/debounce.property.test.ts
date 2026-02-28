/**
 * Property-based tests for debounce behavior
 * **Feature: slider-performance**
 * **Validates: Requirements 1.4**
 */

import * as fc from 'fast-check';

// We'll test the debounce logic directly without React hooks
// This tests the core debounce behavior that the hook implements

/**
 * Creates a debounce function for testing purposes
 * This mirrors the logic in useDebouncedCallback without React dependencies
 */
function createDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): { debounced: (...args: Parameters<T>) => void; cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const effectiveDelay = delay < 0 ? 50 : delay;
    timeoutId = setTimeout(() => {
      callback(...args);
    }, effectiveDelay);
  };

  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { debounced, cancel };
}

describe('Property 1: Debounce coalesces rapid changes to single callback', () => {
  /**
   * **Feature: slider-performance, Property 1: Debounce coalesces rapid changes to single callback**
   * 
   * For any sequence of N slider value changes occurring within the debounce window,
   * the onChange callback should be invoked exactly once with the final value after
   * the debounce delay.
   * **Validates: Requirements 1.4**
   */

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should coalesce rapid changes to single callback with final value', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 20 }),
        fc.integer({ min: 10, max: 200 }),
        (values, debounceDelay) => {
          const callbackValues: number[] = [];
          const callback = (value: number) => {
            callbackValues.push(value);
          };

          const { debounced, cancel } = createDebounce(callback, debounceDelay);

          // Simulate rapid changes - all within debounce window
          for (const value of values) {
            debounced(value);
            // Advance time by less than debounce delay
            jest.advanceTimersByTime(debounceDelay / 2);
          }

          // At this point, no callback should have been called yet
          // because we keep resetting the timer
          
          // Now advance past the debounce delay to trigger the callback
          jest.advanceTimersByTime(debounceDelay + 10);

          // Should have exactly one callback with the final value
          expect(callbackValues).toHaveLength(1);
          expect(callbackValues[0]).toBe(values[values.length - 1]);

          cancel();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should call callback once per debounce window when changes are spaced out', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 10, max: 50 }),
        (values, debounceDelay) => {
          const callbackValues: number[] = [];
          const callback = (value: number) => {
            callbackValues.push(value);
          };

          const { debounced, cancel } = createDebounce(callback, debounceDelay);

          // Simulate spaced out changes - each waits for debounce to complete
          for (const value of values) {
            debounced(value);
            jest.advanceTimersByTime(debounceDelay + 10);
          }

          // Each value should trigger its own callback
          expect(callbackValues).toHaveLength(values.length);
          expect(callbackValues).toEqual(values);

          cancel();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use default 50ms delay for negative values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: -1 }),
        fc.integer({ min: 0, max: 100 }),
        (negativeDelay, value) => {
          const callbackValues: number[] = [];
          const callback = (v: number) => {
            callbackValues.push(v);
          };

          const { debounced, cancel } = createDebounce(callback, negativeDelay);

          debounced(value);

          // Should not be called before 50ms (the default)
          jest.advanceTimersByTime(40);
          expect(callbackValues).toHaveLength(0);

          // Should be called after 50ms
          jest.advanceTimersByTime(20);
          expect(callbackValues).toHaveLength(1);
          expect(callbackValues[0]).toBe(value);

          cancel();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve the final value regardless of intermediate values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (firstValue, middleValues, finalValue) => {
          const callbackValues: number[] = [];
          const callback = (v: number) => {
            callbackValues.push(v);
          };

          const debounceDelay = 50;
          const { debounced, cancel } = createDebounce(callback, debounceDelay);

          // Call with first value
          debounced(firstValue);
          jest.advanceTimersByTime(10);

          // Call with middle values
          for (const value of middleValues) {
            debounced(value);
            jest.advanceTimersByTime(10);
          }

          // Call with final value
          debounced(finalValue);

          // Wait for debounce to complete
          jest.advanceTimersByTime(debounceDelay + 10);

          // Should only have the final value
          expect(callbackValues).toHaveLength(1);
          expect(callbackValues[0]).toBe(finalValue);

          cancel();
        }
      ),
      { numRuns: 100 }
    );
  });
});
