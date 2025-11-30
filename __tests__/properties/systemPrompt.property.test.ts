/**
 * Property-based tests for System Prompt Generation
 * **Feature: optimization-architecture, Property 6: System prompt includes all registry tools**
 * **Validates: Requirements 4.2**
 * 
 * **Feature: professional-suite, Property 7: System Prompt Tool Coverage**
 * **Validates: Requirements 6.3**
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
    
    // Parse for tool entry lines matching the format "- {id}: {label} (range)"
    // Each tool id should appear exactly once in a line starting with "- {id}:"
    const toolEntryPattern = /^- (\w+):/;
    const lines = toolsPrompt.split('\n');
    const toolEntriesFound = lines
      .map(line => line.match(toolEntryPattern))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map(match => match[1]);
    
    // Every tool ID should have a corresponding entry line
    for (const toolId of toolIds) {
      expect(toolEntriesFound).toContain(toolId);
    }
    
    // Number of tool entries should match number of tools
    expect(toolEntriesFound.length).toBe(toolIds.length);
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


/**
 * **Feature: professional-suite, Property 7: System Prompt Tool Coverage**
 * 
 * For any generated system prompt, the prompt SHALL include all 15 tool names
 * with their valid ranges, derived dynamically from TOOL_REGISTRY.
 * **Validates: Requirements 6.3**
 */
describe('Property 7: System Prompt Tool Coverage', () => {
  const EXPECTED_TOOL_COUNT = 15;
  const EXPECTED_TOOL_IDS = [
    'blur', 'grayscale', 'sepia', 'contrast',
    'brightness', 'saturation', 'hue', 'invert',
    'sharpen', 'charcoal', 'edge_detect', 'rotate',
    'implode', 'solarize', 'vignette'
  ];

  it('should include exactly 15 tools in the system prompt', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        const toolIds = getAllToolIds();
        
        // Registry should have exactly 15 tools
        expect(toolIds.length).toBe(EXPECTED_TOOL_COUNT);
        
        // All 15 tools should be mentioned in the system message
        for (const toolId of toolIds) {
          expect(systemMessage).toContain(toolId);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should include all expected tool IDs in the system prompt', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        
        // All expected tool IDs should be present
        for (const toolId of EXPECTED_TOOL_IDS) {
          expect(systemMessage).toContain(toolId);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should include valid ranges for all 15 tools in the system prompt', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        const toolDefinitions = getAllToolDefinitions();
        
        // Should have exactly 15 tool definitions
        expect(toolDefinitions.length).toBe(EXPECTED_TOOL_COUNT);
        
        // Each tool's min and max range should appear in the system message
        for (const tool of toolDefinitions) {
          expect(systemMessage).toContain(String(tool.min));
          expect(systemMessage).toContain(String(tool.max));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should mention "15 professional tools" in the system prompt', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        
        // System prompt should mention the full suite of 15 professional tools
        expect(systemMessage).toContain('15 professional tools');
      }),
      { numRuns: 100 }
    );
  });

  it('should derive tool information dynamically from TOOL_REGISTRY', () => {
    fc.assert(
      fc.property(imageStateArb, (imageState) => {
        const systemMessage = buildSystemMessage(imageState);
        const registryToolIds = Object.keys(TOOL_REGISTRY);
        
        // All tools in TOOL_REGISTRY should be in the system message
        for (const toolId of registryToolIds) {
          expect(systemMessage).toContain(toolId);
        }
        
        // Registry should have exactly 15 tools
        expect(registryToolIds.length).toBe(EXPECTED_TOOL_COUNT);
      }),
      { numRuns: 100 }
    );
  });
});
