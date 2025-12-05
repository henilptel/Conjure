/**
 * Property-based tests for LoadingIndicator message passthrough
 * **Feature: ux-enhancements-v09, Property 10: Loading Indicator Message Passthrough**
 * **Validates: Requirements 3.3**
 */

import * as fc from 'fast-check';
import { render, screen, cleanup } from '@testing-library/react';
import LoadingIndicator from '@/app/components/LoadingIndicator';

// Ensure cleanup after each test
afterEach(() => {
  cleanup();
});

/**
 * Generate non-whitespace-only strings that can be found by getByText
 * Testing library normalizes whitespace, so we need strings with visible content
 */
const visibleMessageArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

describe('Property 10: Loading Indicator Message Passthrough', () => {
  /**
   * **Feature: ux-enhancements-v09, Property 10: Loading Indicator Message Passthrough**
   * 
   * For any processingMessage string, the LoadingIndicator component SHALL render
   * that exact string.
   * **Validates: Requirements 3.3**
   */

  it('should render the exact message string passed as prop', () => {
    fc.assert(
      fc.property(visibleMessageArb, (message) => {
        cleanup();
        
        render(<LoadingIndicator message={message} />);
        
        // The exact message should be rendered in the component
        // Use normalizer: false to match exact content
        expect(screen.getByText(message, { normalizer: (str) => str })).toBeInTheDocument();
      }),
      { numRuns: 100 }
    );
  });

  it('should render default message when no message prop is provided', () => {
    cleanup();
    
    render(<LoadingIndicator />);
    
    // Default message should be "Loading..."
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render processing messages from the PROCESSING_MESSAGES mapping', () => {
    // Import the processing messages to test with real values
    const { PROCESSING_MESSAGES } = require('../../lib/processing-messages');
    
    const processingMessageArb = fc.constantFrom(...Object.values(PROCESSING_MESSAGES) as string[]);

    fc.assert(
      fc.property(processingMessageArb, (message) => {
        cleanup();
        
        render(<LoadingIndicator message={message} />);
        
        // The processing message should be rendered exactly
        expect(screen.getByText(message)).toBeInTheDocument();
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve message content including special characters', () => {
    // Generate messages with alphanumeric and special characters
    // Using a combination of constant strings with special chars
    const specialMessageArb = fc.oneof(
      fc.constant('Processing...'),
      fc.constant('Applying Blur!'),
      fc.constant('Adjusting (Contrast)'),
      fc.constant('Converting [to] Grayscale'),
      fc.constant('Effect: 50%'),
      fc.constant('Step 1/3'),
      fc.constant('Loading - Please wait'),
      fc.constant('Processing_Image'),
      fc.constant('Effect?'),
      visibleMessageArb
    );

    fc.assert(
      fc.property(specialMessageArb, (message) => {
        cleanup();
        
        render(<LoadingIndicator message={message} />);
        
        // The message with special characters should be rendered exactly
        expect(screen.getByText(message, { normalizer: (str) => str })).toBeInTheDocument();
      }),
      { numRuns: 100 }
    );
  });

  it('should render message with different sizes', () => {
    const sizeArb = fc.constantFrom<'sm' | 'md' | 'lg'>('sm', 'md', 'lg');

    fc.assert(
      fc.property(sizeArb, visibleMessageArb, (size, message) => {
        cleanup();
        
        render(<LoadingIndicator message={message} size={size} />);
        
        // The message should be rendered regardless of size
        expect(screen.getByText(message, { normalizer: (str) => str })).toBeInTheDocument();
      }),
      { numRuns: 100 }
    );
  });
});
