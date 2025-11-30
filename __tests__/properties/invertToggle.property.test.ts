/**
 * Property-based tests for invert tool toggle behavior
 * **Feature: professional-suite, Property 6: Invert Toggle Behavior**
 * **Validates: Requirements 1.4, 1.5**
 */

import * as fc from 'fast-check';
import { TOOL_REGISTRY } from '@/lib/tools-registry';

/**
 * Mock IMagickImage interface for testing the invert tool's conditional logic.
 * Tracks whether negate was called to verify toggle behavior.
 * Note: The actual negate() method takes no arguments or a Channels parameter.
 */
interface MockIMagickImage {
  negateCallCount: number;
  negate: () => void;
}

/**
 * Creates a mock image that tracks negate calls.
 */
function createMockImage(): MockIMagickImage {
  return {
    negateCallCount: 0,
    negate() {
      this.negateCallCount++;
    },
  };
}

describe('Property 6: Invert Toggle Behavior', () => {
  /**
   * **Feature: professional-suite, Property 6: Invert Toggle Behavior**
   * 
   * *For any* positive value (> 0) passed to the invert tool, the tool SHALL apply 
   * color negation. *For any* zero value, the tool SHALL NOT apply any negation effect.
   * **Validates: Requirements 1.4, 1.5**
   */

  const invertTool = TOOL_REGISTRY['invert'];

  it('should have invert tool registered with correct properties', () => {
    expect(invertTool).toBeDefined();
    expect(invertTool.id).toBe('invert');
    expect(invertTool.label).toBe('Invert');
    expect(invertTool.min).toBe(0);
    expect(invertTool.max).toBe(1);
    expect(invertTool.defaultValue).toBe(0);
    expect(typeof invertTool.execute).toBe('function');
  });

  it('should apply negate for any positive value', () => {
    fc.assert(
      fc.property(
        // Generate positive values within the valid range (0, 1]
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        (value) => {
          const mockImage = createMockImage();
          
          invertTool.execute(mockImage as unknown as Parameters<typeof invertTool.execute>[0], value);
          
          // Negate should be called exactly once
          expect(mockImage.negateCallCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT apply negate when value is 0', () => {
    const mockImage = createMockImage();
    
    invertTool.execute(mockImage as unknown as Parameters<typeof invertTool.execute>[0], 0);
    
    // Negate should NOT be called
    expect(mockImage.negateCallCount).toBe(0);
  });

  it('should apply negate exactly once for value = 1 (max)', () => {
    const mockImage = createMockImage();
    
    invertTool.execute(mockImage as unknown as Parameters<typeof invertTool.execute>[0], 1);
    
    // Negate should be called exactly once
    expect(mockImage.negateCallCount).toBe(1);
  });

  it('should apply negate independently for each execute call with positive value', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 5 }),
        (value, repeatCount) => {
          const mockImage = createMockImage();
          
          // Call execute multiple times
          for (let i = 0; i < repeatCount; i++) {
            invertTool.execute(mockImage as unknown as Parameters<typeof invertTool.execute>[0], value);
          }
          
          // Negate should be called once per execute call
          expect(mockImage.negateCallCount).toBe(repeatCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle boundary value at exactly 0 (no negate)', () => {
    fc.assert(
      fc.property(
        fc.constant(0),
        (value) => {
          const mockImage = createMockImage();
          
          invertTool.execute(mockImage as unknown as Parameters<typeof invertTool.execute>[0], value);
          
          // Negate should NOT be called for value = 0
          expect(mockImage.negateCallCount).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle integer values within range correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 }),
        (value) => {
          const mockImage = createMockImage();
          
          invertTool.execute(mockImage as unknown as Parameters<typeof invertTool.execute>[0], value);
          
          if (value > 0) {
            expect(mockImage.negateCallCount).toBe(1);
          } else {
            expect(mockImage.negateCallCount).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
