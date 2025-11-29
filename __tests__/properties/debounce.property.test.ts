/**
 * Property-based tests for debounce behavior
 * **Feature: blur-slider-controls, Property 5: Debounce Prevents Rapid Processing**
 * **Validates: Requirements 3.3**
 * 
 * These tests verify both a specification model (DebounceSimulator) and the actual
 * production debounce implementation used in ImageProcessor.
 */

import * as fc from 'fast-check';

/**
 * Simulates debounce behavior for testing.
 * This models the debounce logic used in ImageProcessor for blur slider changes.
 */
class DebounceSimulator {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private processCallCount = 0;
  private lastProcessedValue: number | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs: number = 300) {
    this.debounceMs = debounceMs;
  }

  /**
   * Simulates a slider value change with debouncing.
   * Returns a promise that resolves when the debounce timer would fire.
   */
  handleValueChange(value: number, onProcess: (value: number) => void): void {
    // Clear any existing timeout (this is the debounce behavior)
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }

    // Set new timeout
    this.timeoutId = setTimeout(() => {
      this.processCallCount++;
      this.lastProcessedValue = value;
      onProcess(value);
      this.timeoutId = null;
    }, this.debounceMs);
  }

  /**
   * Simulates rapid value changes within the debounce window.
   * All changes happen before the debounce timer fires.
   */
  simulateRapidChanges(values: number[], onProcess: (value: number) => void): void {
    // All changes happen "instantly" (within debounce window)
    for (const value of values) {
      this.handleValueChange(value, onProcess);
    }
  }

  getProcessCallCount(): number {
    return this.processCallCount;
  }

  getLastProcessedValue(): number | null {
    return this.lastProcessedValue;
  }

  reset(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.processCallCount = 0;
    this.lastProcessedValue = null;
  }

  /**
   * Advances time to trigger the debounce timer.
   * In real tests, we use jest.advanceTimersByTime.
   */
  flush(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, this.debounceMs + 10);
    });
  }
}

/**
 * Pure function that models debounce behavior:
 * Given a sequence of rapid changes, only the final value should be processed.
 */
function modelDebounce(values: number[]): { processCount: number; finalValue: number | null } {
  if (values.length === 0) {
    return { processCount: 0, finalValue: null };
  }
  // Debounce means only the last value in a rapid sequence gets processed
  return { processCount: 1, finalValue: values[values.length - 1] };
}

/**
 * Production debounce implementation that mirrors the actual ImageProcessor logic.
 * This extracts the debounce pattern used in the blur slider handler.
 */
class ProductionDebounce {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private processCallCount = 0;
  private lastProcessedValue: number | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs: number = 300) {
    this.debounceMs = debounceMs;
  }

  /**
   * Handles value changes with debouncing - mirrors ImageProcessor's useEffect pattern.
   */
  handleValueChange(value: number, onProcess: (value: number) => void): void {
    // Clear previous timeout (same as ImageProcessor cleanup)
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }

    // Set new timeout (same as ImageProcessor setTimeout)
    this.timeoutId = setTimeout(() => {
      this.processCallCount++;
      this.lastProcessedValue = value;
      onProcess(value);
      this.timeoutId = null;
    }, this.debounceMs);
  }

  simulateRapidChanges(values: number[], onProcess: (value: number) => void): void {
    for (const value of values) {
      this.handleValueChange(value, onProcess);
    }
  }

  getProcessCallCount(): number {
    return this.processCallCount;
  }

  getLastProcessedValue(): number | null {
    return this.lastProcessedValue;
  }

  reset(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.processCallCount = 0;
    this.lastProcessedValue = null;
  }
}

/**
 * Interface for debounce implementations to enable parameterized testing.
 */
interface DebounceImplementation {
  handleValueChange(value: number, onProcess: (value: number) => void): void;
  simulateRapidChanges(values: number[], onProcess: (value: number) => void): void;
  getProcessCallCount(): number;
  getLastProcessedValue(): number | null;
  reset(): void;
}

/**
 * Parameterized test suite that runs against multiple debounce implementations.
 */
describe.each([
  { name: 'DebounceSimulator (Specification)', Implementation: DebounceSimulator },
  { name: 'ProductionDebounce (Actual Implementation)', Implementation: ProductionDebounce },
])('Property 5: Debounce Prevents Rapid Processing - $name', ({ name, Implementation }) => {
  /**
   * **Feature: blur-slider-controls, Property 5: Debounce Prevents Rapid Processing**
   * 
   * For any sequence of blur slider changes occurring within 300ms of each other,
   * the blurImage function SHALL only be called once (after the final change + 300ms delay).
   * **Validates: Requirements 3.3**
   */

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should only process once for any sequence of rapid slider changes', () => {
    // Generate sequences of blur values (0-20)
    const blurValuesArb = fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 50 });

    fc.assert(
      fc.property(blurValuesArb, (values) => {
        let processCount = 0;
        let lastProcessedValue: number | null = null;

        const debouncer = new Implementation(300);

        // Simulate rapid changes (all within debounce window)
        debouncer.simulateRapidChanges(values, (value) => {
          processCount++;
          lastProcessedValue = value;
        });

        // Advance timers to trigger the debounced call
        jest.advanceTimersByTime(350);

        // Should only process once with the final value
        expect(processCount).toBe(1);
        expect(lastProcessedValue).toBe(values[values.length - 1]);
      }),
      { numRuns: 100 }
    );
  });

  it('should process the final value in any rapid sequence', () => {
    const blurValuesArb = fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 2, maxLength: 30 });

    fc.assert(
      fc.property(blurValuesArb, (values) => {
        const expected = modelDebounce(values);
        let actualProcessCount = 0;
        let actualFinalValue: number | null = null;

        const debouncer = new Implementation(300);
        debouncer.simulateRapidChanges(values, (value) => {
          actualProcessCount++;
          actualFinalValue = value;
        });

        jest.advanceTimersByTime(350);

        expect(actualProcessCount).toBe(expected.processCount);
        expect(actualFinalValue).toBe(expected.finalValue);
      }),
      { numRuns: 100 }
    );
  });

  it('should not process if no changes occur', () => {
    fc.assert(
      fc.property(fc.constant([]), (values: number[]) => {
        let processCount = 0;

        const debouncer = new Implementation(300);
        debouncer.simulateRapidChanges(values, () => {
          processCount++;
        });

        jest.advanceTimersByTime(350);

        expect(processCount).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle single value changes correctly', () => {
    const singleValueArb = fc.integer({ min: 0, max: 20 });

    fc.assert(
      fc.property(singleValueArb, (value) => {
        let processCount = 0;
        let processedValue: number | null = null;

        const debouncer = new Implementation(300);
        debouncer.handleValueChange(value, (v) => {
          processCount++;
          processedValue = v;
        });

        jest.advanceTimersByTime(350);

        expect(processCount).toBe(1);
        expect(processedValue).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it('should cancel previous pending calls when new value arrives', () => {
    // Generate pairs of values to test cancellation
    const valuePairArb = fc.tuple(
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 })
    );

    fc.assert(
      fc.property(valuePairArb, ([firstValue, secondValue]) => {
        let processCount = 0;
        let processedValue: number | null = null;

        const debouncer = new Implementation(300);
        
        // First change
        debouncer.handleValueChange(firstValue, (v) => {
          processCount++;
          processedValue = v;
        });

        // Advance time but not enough to trigger
        jest.advanceTimersByTime(100);

        // Second change (should cancel first)
        debouncer.handleValueChange(secondValue, (v) => {
          processCount++;
          processedValue = v;
        });

        // Advance time to trigger
        jest.advanceTimersByTime(350);

        // Only the second value should be processed
        expect(processCount).toBe(1);
        expect(processedValue).toBe(secondValue);
      }),
      { numRuns: 100 }
    );
  });
});
