/**
 * Property-based tests for operation cancellation
 * **Feature: slider-performance**
 * **Validates: Requirements 4.1**
 */

import * as fc from 'fast-check';

/**
 * Simulates the operation cancellation pattern used in ImageProcessor.
 * This tests the core logic without React dependencies.
 */
interface OperationResult {
  operationId: number;
  value: number;
}

/**
 * Creates an operation manager that simulates the cancellation pattern
 */
function createOperationManager() {
  let currentOperationId = 0;
  let appliedResults: OperationResult[] = [];
  let pendingOperations: Map<number, NodeJS.Timeout> = new Map();

  return {
    /**
     * Starts a new operation, cancelling any pending ones
     */
    startOperation(value: number, delay: number, onComplete: (result: OperationResult) => void): number {
      // Clear all pending timeouts since they're now superseded
      for (const timeoutId of pendingOperations.values()) {
        clearTimeout(timeoutId);
      }
      pendingOperations.clear();

      // Increment operation counter (cancels previous operations)
      const operationId = ++currentOperationId;

      // Schedule the operation
      const timeoutId = setTimeout(() => {
        // Check if this operation is still current
        if (currentOperationId === operationId) {
          const result = { operationId, value };
          appliedResults.push(result);
          onComplete(result);
        }
        pendingOperations.delete(operationId);
      }, delay);

      pendingOperations.set(operationId, timeoutId);
      return operationId;
    },

    /**
     * Gets all results that were actually applied
     */
    getAppliedResults(): OperationResult[] {
      return [...appliedResults];
    },

    /**
     * Gets the current operation ID
     */
    getCurrentOperationId(): number {
      return currentOperationId;
    },

    /**
     * Clears all pending operations and resets state
     */
    reset(): void {
      for (const timeoutId of pendingOperations.values()) {
        clearTimeout(timeoutId);
      }
      pendingOperations.clear();
      appliedResults = [];
      currentOperationId = 0;
    },

    /**
     * Gets count of pending operations
     */
    getPendingCount(): number {
      return pendingOperations.size;
    },
  };
}

describe('Property 4: Operation cancellation ensures final result', () => {
  /**
   * **Feature: slider-performance, Property 4: Operation cancellation ensures final result**
   * 
   * For any sequence of N rapid process() calls, only the result of the final 
   * call should be applied to the canvas, and all intermediate operations 
   * should be discarded.
   * **Validates: Requirements 4.1**
   */

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should only apply final result when operations are rapid', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 10 }),
        fc.integer({ min: 10, max: 100 }),
        (values, operationDelay) => {
          const manager = createOperationManager();
          const completedResults: OperationResult[] = [];

          // Start all operations rapidly (no time between them)
          for (const value of values) {
            manager.startOperation(value, operationDelay, (result) => {
              completedResults.push(result);
            });
          }

          // At this point, all operations are pending but only the last one should complete
          // because each new operation increments the counter

          // Advance time to let operations complete
          jest.advanceTimersByTime(operationDelay + 10);

          // Only the final value should have been applied
          const appliedResults = manager.getAppliedResults();
          expect(appliedResults).toHaveLength(1);
          expect(appliedResults[0].value).toBe(values[values.length - 1]);

          manager.reset();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should apply each result when operations are spaced out', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 10, max: 50 }),
        (values, operationDelay) => {
          const manager = createOperationManager();

          // Start operations with enough time between them for each to complete
          for (const value of values) {
            manager.startOperation(value, operationDelay, () => {});
            jest.advanceTimersByTime(operationDelay + 10);
          }

          // Each operation should have completed
          const appliedResults = manager.getAppliedResults();
          expect(appliedResults).toHaveLength(values.length);
          
          // Results should be in order
          for (let i = 0; i < values.length; i++) {
            expect(appliedResults[i].value).toBe(values[i]);
          }

          manager.reset();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should increment operation ID for each new operation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (operationCount) => {
          const manager = createOperationManager();

          expect(manager.getCurrentOperationId()).toBe(0);

          for (let i = 0; i < operationCount; i++) {
            manager.startOperation(i, 50, () => {});
            expect(manager.getCurrentOperationId()).toBe(i + 1);
          }

          manager.reset();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should discard intermediate operations regardless of their values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (firstValue, middleValues, finalValue) => {
          const manager = createOperationManager();
          const operationDelay = 50;

          // Start first operation
          manager.startOperation(firstValue, operationDelay, () => {});

          // Start middle operations (these should all be cancelled)
          for (const value of middleValues) {
            manager.startOperation(value, operationDelay, () => {});
          }

          // Start final operation
          manager.startOperation(finalValue, operationDelay, () => {});

          // Advance time
          jest.advanceTimersByTime(operationDelay + 10);

          // Only final value should be applied
          const appliedResults = manager.getAppliedResults();
          expect(appliedResults).toHaveLength(1);
          expect(appliedResults[0].value).toBe(finalValue);

          manager.reset();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle single operation correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 10, max: 100 }),
        (value, operationDelay) => {
          const manager = createOperationManager();

          manager.startOperation(value, operationDelay, () => {});

          // Before delay, nothing should be applied
          jest.advanceTimersByTime(operationDelay - 1);
          expect(manager.getAppliedResults()).toHaveLength(0);

          // After delay, result should be applied
          jest.advanceTimersByTime(2);
          expect(manager.getAppliedResults()).toHaveLength(1);
          expect(manager.getAppliedResults()[0].value).toBe(value);

          manager.reset();
        }
      ),
      { numRuns: 100 }
    );
  });
});
