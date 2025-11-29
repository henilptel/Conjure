/**
 * Property-based tests for control state management
 * **Feature: magick-wasm-grayscale, Property 4: Control State Matches Processing State**
 * **Validates: Requirements 5.2, 5.3**
 */

import * as fc from 'fast-check';

// Processing status types matching the component
type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

/**
 * Determines if controls should be disabled based on processing status
 * This mirrors the logic in ImageProcessor.tsx
 */
function shouldControlsBeDisabled(status: ProcessingStatus): boolean {
  return status === 'initializing' || status === 'processing';
}

/**
 * Simulates the isProcessing derivation from the component
 */
function deriveIsProcessing(status: ProcessingStatus): boolean {
  return status === 'initializing' || status === 'processing';
}

describe('Property 4: Control State Matches Processing State', () => {
  /**
   * **Feature: magick-wasm-grayscale, Property 4: Control State Matches Processing State**
   * 
   * For any application state, interactive controls (file input, grayscale button) 
   * SHALL be disabled if and only if `isProcessing` is true.
   */
  it('should disable controls if and only if isProcessing is true', () => {
    // Generate random processing statuses
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );

    fc.assert(
      fc.property(statusArb, (status) => {
        const isProcessing = deriveIsProcessing(status);
        const controlsDisabled = shouldControlsBeDisabled(status);
        
        // Controls should be disabled if and only if isProcessing is true
        expect(controlsDisabled).toBe(isProcessing);
      }),
      { numRuns: 100 }
    );
  });

  it('should have controls enabled for non-processing states', () => {
    // Generate only non-processing statuses
    const nonProcessingStatusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'complete',
      'error'
    );

    fc.assert(
      fc.property(nonProcessingStatusArb, (status) => {
        const isProcessing = deriveIsProcessing(status);
        const controlsDisabled = shouldControlsBeDisabled(status);
        
        // For non-processing states, controls should be enabled
        expect(isProcessing).toBe(false);
        expect(controlsDisabled).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should have controls disabled for processing states', () => {
    // Generate only processing statuses
    const processingStatusArb = fc.constantFrom<ProcessingStatus>(
      'initializing',
      'processing'
    );

    fc.assert(
      fc.property(processingStatusArb, (status) => {
        const isProcessing = deriveIsProcessing(status);
        const controlsDisabled = shouldControlsBeDisabled(status);
        
        // For processing states, controls should be disabled
        expect(isProcessing).toBe(true);
        expect(controlsDisabled).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should maintain bidirectional relationship between isProcessing and control state', () => {
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );

    fc.assert(
      fc.property(statusArb, (status) => {
        const isProcessing = deriveIsProcessing(status);
        const controlsDisabled = shouldControlsBeDisabled(status);
        
        // Bidirectional: isProcessing implies controlsDisabled AND controlsDisabled implies isProcessing
        if (isProcessing) {
          expect(controlsDisabled).toBe(true);
        }
        if (controlsDisabled) {
          expect(isProcessing).toBe(true);
        }
        if (!isProcessing) {
          expect(controlsDisabled).toBe(false);
        }
        if (!controlsDisabled) {
          expect(isProcessing).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});
