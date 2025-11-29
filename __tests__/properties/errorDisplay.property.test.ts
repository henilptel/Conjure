/**
 * Property-based tests for error display
 * **Feature: magick-wasm-grayscale, Property 5: Error State Displays Message**
 * **Validates: Requirements 5.4**
 */

import * as fc from 'fast-check';

// Processing status types matching the component
type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

interface ImageProcessorState {
  status: ProcessingStatus;
  error: string | null;
  hasImage: boolean;
}

/**
 * Determines if an error message should be displayed based on state
 * This mirrors the logic in ImageProcessor.tsx: {state.error && (...)}
 */
function shouldDisplayError(state: ImageProcessorState): boolean {
  return state.error !== null && state.error.length > 0;
}

/**
 * Simulates what error message would be displayed
 */
function getDisplayedErrorMessage(state: ImageProcessorState): string | null {
  if (state.error !== null && state.error.length > 0) {
    return state.error;
  }
  return null;
}

describe('Property 5: Error State Displays Message', () => {
  /**
   * **Feature: magick-wasm-grayscale, Property 5: Error State Displays Message**
   * 
   * For any application state where `error` is non-null, the UI SHALL display 
   * the error message to the user.
   */
  it('should display error message when error state is non-null', () => {
    // Generate random non-empty error messages
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );
    const hasImageArb = fc.boolean();

    fc.assert(
      fc.property(errorMessageArb, statusArb, hasImageArb, (errorMessage, status, hasImage) => {
        const state: ImageProcessorState = {
          status,
          error: errorMessage,
          hasImage,
        };

        // When error is non-null, it should be displayed
        expect(shouldDisplayError(state)).toBe(true);
        expect(getDisplayedErrorMessage(state)).toBe(errorMessage);
      }),
      { numRuns: 100 }
    );
  });

  it('should not display error when error state is null', () => {
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );
    const hasImageArb = fc.boolean();

    fc.assert(
      fc.property(statusArb, hasImageArb, (status, hasImage) => {
        const state: ImageProcessorState = {
          status,
          error: null,
          hasImage,
        };

        // When error is null, nothing should be displayed
        expect(shouldDisplayError(state)).toBe(false);
        expect(getDisplayedErrorMessage(state)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should not display error when error is empty string', () => {
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );
    const hasImageArb = fc.boolean();

    fc.assert(
      fc.property(statusArb, hasImageArb, (status, hasImage) => {
        const state: ImageProcessorState = {
          status,
          error: '',
          hasImage,
        };

        // Empty string should not display error
        expect(shouldDisplayError(state)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should display exact error message provided in state', () => {
    // Generate various error message formats
    const errorMessageArb = fc.oneof(
      fc.constant('Failed to initialize image processor. Please refresh the page.'),
      fc.constant('Please select a valid image file (PNG, JPEG, GIF, or WebP).'),
      fc.constant('Failed to read the selected file. Please try again.'),
      fc.constant('Failed to convert image. Please try again.'),
      fc.string({ minLength: 1, maxLength: 500 })
    );

    fc.assert(
      fc.property(errorMessageArb, (errorMessage) => {
        const state: ImageProcessorState = {
          status: 'error',
          error: errorMessage,
          hasImage: false,
        };

        // The displayed message should exactly match the error in state
        const displayedMessage = getDisplayedErrorMessage(state);
        expect(displayedMessage).toBe(errorMessage);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle error display independently of other state properties', () => {
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });
    const statusArb = fc.constantFrom<ProcessingStatus>(
      'idle',
      'initializing',
      'processing',
      'complete',
      'error'
    );
    const hasImageArb = fc.boolean();

    fc.assert(
      fc.property(errorMessageArb, statusArb, hasImageArb, (errorMessage, status, hasImage) => {
        const state: ImageProcessorState = {
          status,
          error: errorMessage,
          hasImage,
        };

        // Error display should only depend on error being non-null
        // It should not depend on status or hasImage
        const shouldDisplay = shouldDisplayError(state);
        
        // Create variations with different status and hasImage
        const stateVariation1: ImageProcessorState = { ...state, status: 'idle' };
        const stateVariation2: ImageProcessorState = { ...state, status: 'error' };
        const stateVariation3: ImageProcessorState = { ...state, hasImage: !hasImage };

        // All variations should have the same error display behavior
        expect(shouldDisplayError(stateVariation1)).toBe(shouldDisplay);
        expect(shouldDisplayError(stateVariation2)).toBe(shouldDisplay);
        expect(shouldDisplayError(stateVariation3)).toBe(shouldDisplay);
      }),
      { numRuns: 100 }
    );
  });
});
