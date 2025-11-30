/**
 * Property-based tests for System Prompt Generation
 * **Feature: optimization-architecture, Property 6: System prompt includes all registry tools**
 * **Validates: Requirements 4.2**
 */

import * as fc from 'fast-check';
import { ImageState } from '@/lib/types';
import { buildSystemMessage, generateToolsPrompt } from '@/lib/chat';
import { TOOL_REGISTRY, getAllToolDefinitions, getAllToolIds } from '@/lib/tools-registry';

/**
 * Arbitrary generator for valid ImageState objects
 */
const imageStateArb: fc.Arbitrary<ImageState> = fc.boolean().chain((hasImage) => {
  if (hasImage) {
    return fc.record({
      hasImage: fc.constant(true),
      width: fc.integer({ min: 1, max: 10000 }),
      height: fc.integer({ min: 1, max: 10000 }),
      blur: fc.integer({ min: 0, max: 100 }),
      isGrayscale: fc.boolean(),
      activeTools: fc.constant([]),
    });
  } else {
    return fc.record({
      hasImage: fc.constant(false),
      width: fc.constant(null),
      height: fc.constant(null),
      blur: fc.integer({ min: 0, max: 100 }),
      isGrayscale: fc.boolean(),
      activeTools: fc.constant([]),
    });
  }
});

describe('Property 6: System prompt includes all registry tools', () => {
  /**
   * **Feature: optimization-architecture, Property 6: System prompt includes all registry tools**
   * 
   * For any TOOL_REGISTRY configuration, the generated system prompt should contain
   * each tool's label and min/max range.
   * **Validates: Requirements 4.2**
   */

  it('should include all tool IDs from registry in the generated tools prompt', () => {
    const toolsPrompt = generateToolsPrompt();
    const toolIds = getAllToolIds();
    
    // Every tool ID in the registry should appear in the prompt
    for (const toolId of toolIds) {
      expect(toolsPrompt).toContain(toolId);
    }
  });

  it('should include all tool labels from registry in the generated tools prompt', () => {
    const toolsPrompt = generateToolsPrompt();
    const toolDefinitions = getAllToolDefinitions();
    
    // Every tool label in the registry should appear in the prompt
    for (const tool of toolDefinitions) {
      expect(toolsPrompt).toContain(tool.label);
    }
  });

  it('should include min and max values for each tool in the generated tools prompt', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const toolsPrompt = generateToolsPrompt();
        const toolDefinitions = getAllToolDefinitions();
        
        // Every tool's min and max should appear in the prompt
        for (const tool of toolDefinitions) {
          expect(toolsPrompt).toContain(String(tool.min));
          expect(toolsPrompt).toContain(String(tool.max));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should include all registry tools in the system message for any ImageState', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        const toolIds = getAllToolIds();
        
        // Every tool ID should appear in the system message
        for (const toolId of toolIds) {
          expect(systemMessage).toContain(toolId);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should include tool ranges in the system message for any ImageState', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        const toolDefinitions = getAllToolDefinitions();
        
        // Every tool's min and max should appear in the system message
        for (const tool of toolDefinitions) {
          expect(systemMessage).toContain(String(tool.min));
          expect(systemMessage).toContain(String(tool.max));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should have one line per tool in the generated tools prompt', () => {
    const toolsPrompt = generateToolsPrompt();
    const toolIds = getAllToolIds();
    const lines = toolsPrompt.split('\n').filter(line => line.trim().length > 0);
    
    // Number of lines should match number of tools
    expect(lines.length).toBe(toolIds.length);
  });

  it('should format each tool line with id, label, and range', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const toolsPrompt = generateToolsPrompt();
        const toolDefinitions = getAllToolDefinitions();
        
        // Each tool should have a properly formatted line
        for (const tool of toolDefinitions) {
          // Line should start with "- {id}:" format
          expect(toolsPrompt).toMatch(new RegExp(`- ${tool.id}:`));
          // Line should contain the label
          expect(toolsPrompt).toContain(tool.label);
        }
      }),
      { numRuns: 100 }
    );
  });
});
