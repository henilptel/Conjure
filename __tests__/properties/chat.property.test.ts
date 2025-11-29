/**
 * Property-based tests for Chat API route
 * **Feature: context-aware-chat, Property 1: System message contains all context fields**
 * **Validates: Requirements 2.2**
 */

import * as fc from 'fast-check';
import { ImageState } from '@/lib/types';
import { buildSystemMessage, getMessageClasses } from '@/lib/chat';

/**
 * Arbitrary generator for valid ImageState objects
 */
const imageStateArb: fc.Arbitrary<ImageState> = fc.record({
  hasImage: fc.boolean(),
  width: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
  height: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
  blur: fc.integer({ min: 0, max: 100 }),
  isGrayscale: fc.boolean(),
});

/**
 * Arbitrary generator for ImageState with an image loaded (has dimensions)
 */
const imageStateWithImageArb: fc.Arbitrary<ImageState> = fc.record({
  hasImage: fc.constant(true),
  width: fc.integer({ min: 1, max: 10000 }),
  height: fc.integer({ min: 1, max: 10000 }),
  blur: fc.integer({ min: 0, max: 100 }),
  isGrayscale: fc.boolean(),
});

describe('Property 1: System message contains all context fields', () => {
  /**
   * **Feature: context-aware-chat, Property 1: System message contains all context fields**
   * 
   * For any valid ImageState object passed to the API route, the constructed system message
   * SHALL contain the hasImage status, width, height, blur level, and grayscale status values.
   */
  it('should contain hasImage status in system message', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        
        // The system message should contain the hasImage value
        expect(systemMessage).toContain(`Image loaded: ${imageState.hasImage}`);
      }),
      { numRuns: 100 }
    );
  });

  it('should contain blur level in system message', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        
        // The system message should contain the blur value
        expect(systemMessage).toContain(`Blur level: ${imageState.blur}`);
      }),
      { numRuns: 100 }
    );
  });

  it('should contain grayscale status in system message', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        
        // The system message should contain the grayscale value
        expect(systemMessage).toContain(`Grayscale: ${imageState.isGrayscale}`);
      }),
      { numRuns: 100 }
    );
  });

  it('should contain dimensions when image is loaded with valid dimensions', () => {
    fc.assert(
      fc.property(imageStateWithImageArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        
        // The system message should contain the dimensions
        expect(systemMessage).toContain(`${imageState.width}x${imageState.height} pixels`);
      }),
      { numRuns: 100 }
    );
  });

  it('should indicate no image loaded when hasImage is false', () => {
    fc.assert(
      fc.property(
        fc.record({
          hasImage: fc.constant(false),
          width: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
          height: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
          blur: fc.integer({ min: 0, max: 100 }),
          isGrayscale: fc.boolean(),
        }),
        (imageState) => {
          const systemMessage = buildSystemMessage(imageState);
          
          // When no image is loaded, should indicate that
          expect(systemMessage).toContain('No image loaded');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should contain all required context fields for any valid ImageState', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        
        // Verify all required fields are present
        expect(systemMessage).toContain('Image loaded:');
        expect(systemMessage).toContain('Dimensions:');
        expect(systemMessage).toContain('Blur level:');
        expect(systemMessage).toContain('Grayscale:');
        
        // Verify the actual values are included
        expect(systemMessage).toContain(String(imageState.hasImage));
        expect(systemMessage).toContain(String(imageState.blur));
        expect(systemMessage).toContain(String(imageState.isGrayscale));
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: context-aware-chat, Property 2: Message styling differs by role**
 * **Validates: Requirements 3.4**
 */

/**
 * Arbitrary generator for message roles
 */
const messageRoleArb = fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>;

describe('Property 2: Message styling differs by role', () => {
  /**
   * **Feature: context-aware-chat, Property 2: Message styling differs by role**
   * 
   * For any message with role 'user' or 'assistant', the rendered message component
   * SHALL apply distinct CSS classes based on the role value, such that user messages
   * and assistant messages are visually distinguishable.
   */
  it('should return different classes for user and assistant roles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const userClasses = getMessageClasses('user');
        const assistantClasses = getMessageClasses('assistant');
        
        // Classes should be different for different roles
        expect(userClasses).not.toBe(assistantClasses);
      }),
      { numRuns: 100 }
    );
  });

  it('should return consistent classes for the same role', () => {
    fc.assert(
      fc.property(messageRoleArb, (role) => {
        const classes1 = getMessageClasses(role);
        const classes2 = getMessageClasses(role);
        
        // Same role should always produce same classes
        expect(classes1).toBe(classes2);
      }),
      { numRuns: 100 }
    );
  });

  it('should apply user-specific styling for user messages', () => {
    fc.assert(
      fc.property(fc.constant('user' as const), (role) => {
        const classes = getMessageClasses(role);
        
        // User messages should have distinct styling (blue background, right-aligned)
        expect(classes).toContain('bg-blue');
        expect(classes).toContain('ml-auto');
      }),
      { numRuns: 100 }
    );
  });

  it('should apply assistant-specific styling for assistant messages', () => {
    fc.assert(
      fc.property(fc.constant('assistant' as const), (role) => {
        const classes = getMessageClasses(role);
        
        // Assistant messages should have distinct styling (zinc background, left-aligned)
        expect(classes).toContain('bg-zinc');
        expect(classes).toContain('mr-auto');
      }),
      { numRuns: 100 }
    );
  });

  it('should produce non-empty class strings for any valid role', () => {
    fc.assert(
      fc.property(messageRoleArb, (role) => {
        const classes = getMessageClasses(role);
        
        // Classes should never be empty
        expect(classes.length).toBeGreaterThan(0);
        expect(classes.trim()).not.toBe('');
      }),
      { numRuns: 100 }
    );
  });
});
