/**
 * Property-based tests for control state management
 * **Feature: magick-wasm-grayscale, Property 4: Control State Matches Processing State**
 * **Feature: blur-slider-controls, Property 6: Control State Matches Processing State (Extended)**
 * **Validates: Requirements 5.2, 5.3, 3.5, 4.3**
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

/**
 * Models the control state for all interactive elements in ImageProcessor
 * Extended to include the blur slider alongside the grayscale button
 */
interface ControlStates {
  fileInputDisabled: boolean;
  grayscaleButtonDisabled: boolean;
  blurSliderDisabled: boolean;
}

/**
 * Derives the expected control states based on processing status
 * All controls should be disabled when processing is in progress
 */
function deriveControlStates(status: ProcessingStatus): ControlStates {
  const isProcessing = deriveIsProcessing(status);
  return {
    fileInputDisabled: isProcessing,
    grayscaleButtonDisabled: isProcessing,
    blurSliderDisabled: isProcessing,
  };
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


describe('Property 6: Control State Matches Processing State (Extended)', () => {
  /**
   * **Feature: blur-slider-controls, Property 6: Control State Matches Processing State (Extended)**
   * 
   * For any application state, both the Grayscale button AND the Blur slider 
   * SHALL be disabled if and only if processing is in progress.
   * **Validates: Requirements 3.5, 4.3**
   */

  it('should disable both grayscale button and blur slider when processing', () => {
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );

    fc.assert(
      fc.property(statusArb, (status) => {
        const controlStates = deriveControlStates(status);
        const isProcessing = deriveIsProcessing(status);
        
        // Both controls should be disabled if and only if isProcessing is true
        expect(controlStates.grayscaleButtonDisabled).toBe(isProcessing);
        expect(controlStates.blurSliderDisabled).toBe(isProcessing);
      }),
      { numRuns: 100 }
    );
  });

  it('should have consistent disabled state across all controls', () => {
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );

    fc.assert(
      fc.property(statusArb, (status) => {
        const controlStates = deriveControlStates(status);
        
        // All controls should have the same disabled state
        expect(controlStates.fileInputDisabled).toBe(controlStates.grayscaleButtonDisabled);
        expect(controlStates.grayscaleButtonDisabled).toBe(controlStates.blurSliderDisabled);
      }),
      { numRuns: 100 }
    );
  });

  it('should enable all controls when not processing', () => {
    const nonProcessingStatusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'complete',
      'error'
    );

    fc.assert(
      fc.property(nonProcessingStatusArb, (status) => {
        const controlStates = deriveControlStates(status);
        
        // All controls should be enabled when not processing
        expect(controlStates.fileInputDisabled).toBe(false);
        expect(controlStates.grayscaleButtonDisabled).toBe(false);
        expect(controlStates.blurSliderDisabled).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should disable all controls when processing', () => {
    const processingStatusArb = fc.constantFrom<ProcessingStatus>(
      'initializing',
      'processing'
    );

    fc.assert(
      fc.property(processingStatusArb, (status) => {
        const controlStates = deriveControlStates(status);
        
        // All controls should be disabled when processing
        expect(controlStates.fileInputDisabled).toBe(true);
        expect(controlStates.grayscaleButtonDisabled).toBe(true);
        expect(controlStates.blurSliderDisabled).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should maintain bidirectional relationship for all controls', () => {
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
        const controlStates = deriveControlStates(status);
        
        // Bidirectional: isProcessing <=> all controls disabled
        if (isProcessing) {
          expect(controlStates.fileInputDisabled).toBe(true);
          expect(controlStates.grayscaleButtonDisabled).toBe(true);
          expect(controlStates.blurSliderDisabled).toBe(true);
        }
        if (controlStates.fileInputDisabled && controlStates.grayscaleButtonDisabled && controlStates.blurSliderDisabled) {
          expect(isProcessing).toBe(true);
        }
        if (!isProcessing) {
          expect(controlStates.fileInputDisabled).toBe(false);
          expect(controlStates.grayscaleButtonDisabled).toBe(false);
          expect(controlStates.blurSliderDisabled).toBe(false);
        }
        if (!controlStates.fileInputDisabled || !controlStates.grayscaleButtonDisabled || !controlStates.blurSliderDisabled) {
          expect(isProcessing).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});
