/**
 * Property-based tests for Worker Request Timeout
 * **Feature: performance-fixes**
 * **Validates: Requirements 1.3, 1.4, 1.5, 1.6**
 */

import * as fc from 'fast-check';

/**
 * Simulates the WorkerManager timeout pattern for testing.
 * This tests the core timeout logic without actual Worker dependencies.
 */
interface PendingRequest {
  resolve: (result: { pixels: Uint8Array; width: number; height: number }) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  rejected?: boolean;
  resolved?: boolean;
  rejectionError?: Error;
}

/**
 * Creates a mock worker manager that simulates the timeout pattern
 */
function createMockWorkerManager(requestTimeoutMs: number = 30000) {
  let requestId = 0;
  const pendingRequests = new Map<number, PendingRequest>();
  const clearedTimeouts: number[] = [];

  return {
    /**
     * Simulates starting a process request with timeout
     */
    startRequest(): { requestId: number; pending: PendingRequest } {
      const currentRequestId = ++requestId;

      const pending: PendingRequest = {
        resolve: () => { pending.resolved = true; },
        reject: (error: Error) => { 
          pending.rejected = true; 
          pending.rejectionError = error;
        },
        timeoutId: setTimeout(() => {
          const p = pendingRequests.get(currentRequestId);
          if (p) {
            pendingRequests.delete(currentRequestId);
            const error = new Error(`Worker request ${currentRequestId} timed out after ${requestTimeoutMs}ms`);
            p.reject(error);
          }
        }, requestTimeoutMs),
      };

      pendingRequests.set(currentRequestId, pending);
      return { requestId: currentRequestId, pending };
    },

    /**
     * Simulates successful completion of a request
     */
    completeRequest(reqId: number): boolean {
      const pending = pendingRequests.get(reqId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        clearedTimeouts.push(reqId);
        pendingRequests.delete(reqId);
        pending.resolve({ pixels: new Uint8Array([1, 2, 3, 4]), width: 1, height: 1 });
        return true;
      }
      return false;
    },

    /**
     * Simulates error completion of a request
     */
    errorRequest(reqId: number, errorMessage: string): boolean {
      const pending = pendingRequests.get(reqId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        clearedTimeouts.push(reqId);
        pendingRequests.delete(reqId);
        pending.reject(new Error(errorMessage));
        return true;
      }
      return false;
    },

    /**
     * Gets the count of pending requests
     */
    getPendingCount(): number {
      return pendingRequests.size;
    },

    /**
     * Checks if a request is pending
     */
    isPending(reqId: number): boolean {
      return pendingRequests.has(reqId);
    },

    /**
     * Gets requests whose timeouts were cleared
     */
    getClearedTimeouts(): number[] {
      return [...clearedTimeouts];
    },

    /**
     * Gets the configured timeout
     */
    getTimeoutMs(): number {
      return requestTimeoutMs;
    },

    /**
     * Clears all pending requests (for cleanup)
     */
    dispose(): void {
      for (const [, pending] of pendingRequests) {
        clearTimeout(pending.timeoutId);
      }
      pendingRequests.clear();
    },
  };
}

describe('Property 1: Timeout Rejection', () => {
  /**
   * **Feature: performance-fixes, Property 1: Timeout Rejection**
   * 
   * For any worker request that does not receive a response within the timeout
   * duration, the request Promise SHALL be rejected with a timeout error.
   * **Validates: Requirements 1.3**
   */

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should reject request with timeout error when timeout expires', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }), // timeout duration
        fc.integer({ min: 1, max: 10 }), // number of requests
        (timeoutMs, requestCount) => {
          const manager = createMockWorkerManager(timeoutMs);
          const requests: { requestId: number; pending: PendingRequest }[] = [];

          // Start multiple requests
          for (let i = 0; i < requestCount; i++) {
            requests.push(manager.startRequest());
          }

          // All requests should be pending
          expect(manager.getPendingCount()).toBe(requestCount);

          // Advance time past timeout
          jest.advanceTimersByTime(timeoutMs + 10);

          // All requests should have been rejected with timeout error
          expect(manager.getPendingCount()).toBe(0);
          
          for (const req of requests) {
            expect(req.pending.rejected).toBe(true);
            expect(req.pending.rejectionError).toBeDefined();
            expect(req.pending.rejectionError!.message).toContain('timed out');
            expect(req.pending.rejectionError!.message).toContain(`${timeoutMs}ms`);
          }

          manager.dispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include request ID in timeout error message', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }),
        (timeoutMs) => {
          const manager = createMockWorkerManager(timeoutMs);
          const { requestId, pending } = manager.startRequest();

          jest.advanceTimersByTime(timeoutMs + 10);

          expect(pending.rejected).toBe(true);
          expect(pending.rejectionError).toBeDefined();
          expect(pending.rejectionError!.message).toContain(`${requestId}`);

          manager.dispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 2: Timeout Cleanup', () => {
  /**
   * **Feature: performance-fixes, Property 2: Timeout Cleanup**
   * 
   * For any worker request that times out, the request SHALL be removed from
   * the pendingRequests Map immediately upon timeout.
   * **Validates: Requirements 1.4**
   */

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should remove request from pending map on timeout', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 1, max: 10 }),
        (timeoutMs, requestCount) => {
          const manager = createMockWorkerManager(timeoutMs);
          const requestIds: number[] = [];

          // Start requests
          for (let i = 0; i < requestCount; i++) {
            const { requestId } = manager.startRequest();
            requestIds.push(requestId);
          }

          // Verify all are pending
          expect(manager.getPendingCount()).toBe(requestCount);
          for (const reqId of requestIds) {
            expect(manager.isPending(reqId)).toBe(true);
          }

          // Advance time past timeout
          jest.advanceTimersByTime(timeoutMs + 10);

          // Verify all are removed
          expect(manager.getPendingCount()).toBe(0);
          for (const reqId of requestIds) {
            expect(manager.isPending(reqId)).toBe(false);
          }

          manager.dispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not affect other pending requests when one times out', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 500 }),
        fc.integer({ min: 200, max: 1000 }),
        (shortTimeout, longTimeout) => {
          // Ensure longTimeout > shortTimeout
          const actualLongTimeout = Math.max(longTimeout, shortTimeout + 100);
          
          const shortManager = createMockWorkerManager(shortTimeout);
          const longManager = createMockWorkerManager(actualLongTimeout);

          shortManager.startRequest();
          const { requestId: longReqId } = longManager.startRequest();

          // Advance past short timeout but not long timeout
          jest.advanceTimersByTime(shortTimeout + 10);

          // Short should be timed out
          expect(shortManager.getPendingCount()).toBe(0);
          
          // Long should still be pending
          expect(longManager.isPending(longReqId)).toBe(true);

          // Clean up
          shortManager.dispose();
          longManager.dispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 3: Completed Request No Timeout', () => {
  /**
   * **Feature: performance-fixes, Property 3: Completed Request No Timeout**
   * 
   * For any worker request that completes (either successfully or with an error),
   * no timeout rejection SHALL occur for that request afterward.
   * **Validates: Requirements 1.5, 1.6**
   */

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not timeout after successful completion', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 10, max: 90 }), // completion time as percentage of timeout
        (timeoutMs, completionPercent) => {
          const manager = createMockWorkerManager(timeoutMs);
          const { requestId, pending } = manager.startRequest();

          // Complete before timeout
          const completionTime = Math.floor(timeoutMs * completionPercent / 100);
          jest.advanceTimersByTime(completionTime);
          manager.completeRequest(requestId);

          // Verify timeout was cleared
          expect(manager.getClearedTimeouts()).toContain(requestId);

          // Verify resolved, not rejected
          expect(pending.resolved).toBe(true);
          expect(pending.rejected).toBeUndefined();

          // Advance past original timeout
          jest.advanceTimersByTime(timeoutMs - completionTime + 100);

          // Should still be resolved, not rejected with timeout
          expect(pending.rejected).toBeUndefined();

          manager.dispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not timeout after error completion', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 10, max: 90 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (timeoutMs, completionPercent, errorMessage) => {
          const manager = createMockWorkerManager(timeoutMs);
          const { requestId, pending } = manager.startRequest();

          // Error before timeout
          const completionTime = Math.floor(timeoutMs * completionPercent / 100);
          jest.advanceTimersByTime(completionTime);
          manager.errorRequest(requestId, errorMessage);

          // Verify timeout was cleared
          expect(manager.getClearedTimeouts()).toContain(requestId);

          // Verify rejected with the error message, not timeout
          expect(pending.rejected).toBe(true);
          expect(pending.rejectionError).toBeDefined();
          expect(pending.rejectionError!.message).toBe(errorMessage);
          expect(pending.rejectionError!.message).not.toContain('timed out');

          // Advance past original timeout
          jest.advanceTimersByTime(timeoutMs - completionTime + 100);

          // Error message should still be the original, not timeout
          expect(pending.rejectionError!.message).toBe(errorMessage);

          manager.dispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clear timeout for all completed requests regardless of completion order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }), // true = success, false = error
        (timeoutMs, completionTypes) => {
          const manager = createMockWorkerManager(timeoutMs);
          const requests: { requestId: number; pending: PendingRequest; isSuccess: boolean }[] = [];

          // Start all requests
          for (let i = 0; i < completionTypes.length; i++) {
            const { requestId, pending } = manager.startRequest();
            requests.push({ requestId, pending, isSuccess: completionTypes[i] });
          }

          // Complete in reverse order
          jest.advanceTimersByTime(timeoutMs / 2);
          for (let i = requests.length - 1; i >= 0; i--) {
            if (requests[i].isSuccess) {
              manager.completeRequest(requests[i].requestId);
            } else {
              manager.errorRequest(requests[i].requestId, `Error ${i}`);
            }
          }

          // All timeouts should be cleared
          const clearedTimeouts = manager.getClearedTimeouts();
          for (const req of requests) {
            expect(clearedTimeouts).toContain(req.requestId);
          }

          // Advance past timeout
          jest.advanceTimersByTime(timeoutMs);

          // No timeout rejections should have occurred
          for (const req of requests) {
            if (req.pending.rejected) {
              expect(req.pending.rejectionError!.message).not.toContain('timed out');
            }
          }

          manager.dispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
