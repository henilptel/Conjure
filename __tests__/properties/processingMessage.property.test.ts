/**
 * Property-based tests for processing message tool correspondence
 * **Feature: ux-enhancements-v09, Property 9: Processing Message Tool Correspondence**
 * **Validates: Requirements 3.2**
 */

import * as fc from 'fast-check';
import { getProcessingMessage, PROCESSING_MESSAGES } from '../../lib/processing-messages';

// All known tool IDs from the registry
const KNOWN_TOOL_IDS = [
  'blur',
  'contrast',
  'brightness',
  'saturation',
  'grayscale',
  'invert',
  'rotate',
  'sepia',
  'sharpen',
  'hue',
  'charcoal',
  'edge_detect',
  'wave',
  'solarize',
  'vignette',
];

describe('Property 9: Processing Message Tool Correspondence', () => {
  /**
   * **Feature: ux-enhancements-v09, Property 9: Processing Message Tool Correspondence**
   * 
   * For any tool being processed, the processingMessage SHALL contain a non-empty string
   * that identifies the tool type.
   * **Validates: Requirements 3.2**
   */

  it('should return a non-empty string for any known tool ID', () => {
    const knownToolArb = fc.constantFrom(...KNOWN_TOOL_IDS);

    fc.assert(
      fc.property(knownToolArb, (toolId) => {
        const message = getProcessingMessage(toolId);
        
        // Message should be a non-empty string
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should return a message that identifies the tool type for known tools', () => {
    const knownToolArb = fc.constantFrom(...KNOWN_TOOL_IDS);

    fc.assert(
      fc.property(knownToolArb, (toolId) => {
        const message = getProcessingMessage(toolId);
        
        // Message should be tool-specific (from PROCESSING_MESSAGES)
        expect(message).toBe(PROCESSING_MESSAGES[toolId]);
        
        // Message should contain action-related words (Applying, Adjusting, Converting, etc.)
        const actionWords = ['Applying', 'Adjusting', 'Converting', 'Inverting', 'Rotating', 'Sharpening', 'Detecting', 'Adding'];
        const containsActionWord = actionWords.some(word => message.includes(word));
        expect(containsActionWord).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should return a default message for unknown tool IDs', () => {
    // Generate arbitrary strings that are NOT known tool IDs
    const unknownToolArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !KNOWN_TOOL_IDS.includes(s));

    fc.assert(
      fc.property(unknownToolArb, (toolId) => {
        const message = getProcessingMessage(toolId);
        
        // Should return the default "Processing..." message
        expect(message).toBe('Processing...');
      }),
      { numRuns: 100 }
    );
  });

  it('should return consistent messages for the same tool ID', () => {
    const knownToolArb = fc.constantFrom(...KNOWN_TOOL_IDS);

    fc.assert(
      fc.property(knownToolArb, (toolId) => {
        const message1 = getProcessingMessage(toolId);
        const message2 = getProcessingMessage(toolId);
        
        // Same tool ID should always return the same message
        expect(message1).toBe(message2);
      }),
      { numRuns: 100 }
    );
  });

  it('should have unique messages for each tool type', () => {
    // Verify that each tool has a distinct message
    const messages = KNOWN_TOOL_IDS.map(id => getProcessingMessage(id));
    const uniqueMessages = new Set(messages);
    
    // Each tool should have a unique message
    expect(uniqueMessages.size).toBe(KNOWN_TOOL_IDS.length);
  });

  it('should end all messages with ellipsis', () => {
    const knownToolArb = fc.constantFrom(...KNOWN_TOOL_IDS);

    fc.assert(
      fc.property(knownToolArb, (toolId) => {
        const message = getProcessingMessage(toolId);
        
        // All messages should end with "..."
        expect(message.endsWith('...')).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
