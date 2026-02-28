/**
 * Property-based tests for HUD Tool Panel
 * **Feature: hud-tool-panel**
 */

import * as fc from 'fast-check';
import {
  TOOL_CONFIGS,
  createToolConfig,
  isValidToolName,
  addTools,
  updateToolValue,
  removeTool,
  type ToolName,
  type ActiveTool,
} from '@/lib/types';

/**
 * **Feature: hud-tool-panel, Property 7: Tool Configuration Validity**
 * **Validates: Requirements 6.3**
 * 
 * For any tool created from TOOL_CONFIGS, the min value SHALL be 
 * less than or equal to the max value.
 */
describe('Property 7: Tool Configuration Validity', () => {
  const validToolNames: ToolName[] = ['blur', 'grayscale', 'sepia', 'contrast'];

  it('all TOOL_CONFIGS have min <= max', () => {
    fc.assert(
      fc.property(fc.constantFrom(...validToolNames), (toolName) => {
        const config = TOOL_CONFIGS[toolName];
        expect(config.min).toBeLessThanOrEqual(config.max);
      }),
      { numRuns: 100 }
    );
  });

  it('createToolConfig returns valid ActiveTool with min <= max for valid tool names', () => {
    fc.assert(
      fc.property(fc.constantFrom(...validToolNames), (toolName) => {
        const tool = createToolConfig(toolName);
        expect(tool).not.toBeNull();
        if (tool) {
          expect(tool.min).toBeLessThanOrEqual(tool.max);
          expect(tool.value).toBeGreaterThanOrEqual(tool.min);
          expect(tool.value).toBeLessThanOrEqual(tool.max);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('createToolConfig returns null for invalid tool names', () => {
    const invalidToolNameArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !validToolNames.includes(s as ToolName));

    fc.assert(
      fc.property(invalidToolNameArb, (invalidName) => {
        const tool = createToolConfig(invalidName);
        expect(tool).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('isValidToolName correctly identifies valid tool names', () => {
    fc.assert(
      fc.property(fc.constantFrom(...validToolNames), (toolName) => {
        expect(isValidToolName(toolName)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('isValidToolName correctly rejects invalid tool names', () => {
    const invalidToolNameArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !validToolNames.includes(s as ToolName));

    fc.assert(
      fc.property(invalidToolNameArb, (invalidName) => {
        expect(isValidToolName(invalidName)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});


// Arbitraries for generating test data
const validToolNames: ToolName[] = ['blur', 'grayscale', 'sepia', 'contrast'];

const validToolNameArb = fc.constantFrom(...validToolNames);

const activeToolArb = fc.constantFrom(...validToolNames).map(name => {
  const tool = createToolConfig(name);
  return tool!;
});

const activeToolWithRandomValueArb = fc.constantFrom(...validToolNames).chain(name => {
  const config = TOOL_CONFIGS[name];
  return fc.integer({ min: config.min, max: config.max }).map(value => ({
    id: config.id,
    label: config.label,
    value,
    min: config.min,
    max: config.max,
  }));
});

// Generate unique tools array (no duplicates)
const uniqueToolsArrayArb = fc.subarray(validToolNames, { minLength: 0, maxLength: 4 })
  .map(names => names.map(name => createToolConfig(name)!));

/**
 * **Feature: hud-tool-panel, Property 1: Tool Addition Preserves Existing Tools**
 * **Validates: Requirements 1.1, 1.3**
 * 
 * For any activeTools array and any valid tool name not already present,
 * adding that tool SHALL result in an array containing all previous tools plus the new tool.
 */
describe('Property 1: Tool Addition Preserves Existing Tools', () => {
  it('adding a new tool preserves all existing tools', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb,
        fc.subarray(validToolNames, { minLength: 1, maxLength: 4 }),
        (existingTools, newToolNames) => {
          const result = addTools(existingTools, newToolNames);
          
          // All existing tools should still be present with same values
          for (const existingTool of existingTools) {
            const found = result.find(t => t.id === existingTool.id);
            expect(found).toBeDefined();
            expect(found).toEqual(existingTool);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adding new tools increases array length by number of unique new tools', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb,
        fc.subarray(validToolNames, { minLength: 1, maxLength: 4 }),
        (existingTools, newToolNames) => {
          const existingIds = new Set(existingTools.map(t => t.id));
          const uniqueNewTools = newToolNames.filter(name => !existingIds.has(name));
          
          const result = addTools(existingTools, newToolNames);
          
          expect(result.length).toBe(existingTools.length + uniqueNewTools.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: hud-tool-panel, Property 2: Tool Addition Idempotence**
 * **Validates: Requirements 1.1**
 * 
 * For any activeTools array and any tool name already present,
 * attempting to add that tool again SHALL result in an unchanged array (no duplicates).
 */
describe('Property 2: Tool Addition Idempotence', () => {
  it('adding a tool that already exists does not create duplicates', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb.filter(arr => arr.length > 0),
        (existingTools) => {
          // Try to add tools that already exist
          const existingNames = existingTools.map(t => t.id);
          const result = addTools(existingTools, existingNames);
          
          // Array should be unchanged
          expect(result.length).toBe(existingTools.length);
          expect(result).toEqual(existingTools);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adding the same tool twice in one call does not create duplicates', () => {
    fc.assert(
      fc.property(
        validToolNameArb,
        (toolName) => {
          const result = addTools([], [toolName, toolName, toolName]);
          
          // Should only have one instance of the tool
          expect(result.length).toBe(1);
          expect(result[0].id).toBe(toolName);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: hud-tool-panel, Property 3: Tool Removal Preserves Other Tools**
 * **Validates: Requirements 4.2**
 * 
 * For any activeTools array with multiple tools and any tool id present in the array,
 * removing that tool SHALL result in an array containing all other tools unchanged.
 */
describe('Property 3: Tool Removal Preserves Other Tools', () => {
  it('removing a tool preserves all other tools unchanged', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb.filter(arr => arr.length >= 2),
        fc.nat(),
        (tools, indexSeed) => {
          const indexToRemove = indexSeed % tools.length;
          const toolToRemove = tools[indexToRemove];
          const otherTools = tools.filter((_, i) => i !== indexToRemove);
          
          const result = removeTool(tools, toolToRemove.id);
          
          // Result should have one less tool
          expect(result.length).toBe(tools.length - 1);
          
          // All other tools should be preserved exactly
          for (const otherTool of otherTools) {
            const found = result.find(t => t.id === otherTool.id);
            expect(found).toBeDefined();
            expect(found).toEqual(otherTool);
          }
          
          // Removed tool should not be present
          expect(result.find(t => t.id === toolToRemove.id)).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('removing a non-existent tool returns unchanged array', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb,
        fc.string({ minLength: 10, maxLength: 20 }), // Guaranteed non-existent id
        (tools, fakeId) => {
          const result = removeTool(tools, fakeId);
          
          expect(result.length).toBe(tools.length);
          expect(result).toEqual(tools);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: hud-tool-panel, Property 4: Slider Value Constraints**
 * **Validates: Requirements 3.3, 3.4**
 * 
 * For any ActiveTool, the value SHALL always be within the range [min, max]
 * inclusive after any update operation.
 */
describe('Property 4: Slider Value Constraints', () => {
  it('updateToolValue clamps values to min/max range', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb.filter(arr => arr.length > 0),
        fc.nat(),
        fc.integer({ min: -1000, max: 1000 }),
        (tools, indexSeed, newValue) => {
          const indexToUpdate = indexSeed % tools.length;
          const toolToUpdate = tools[indexToUpdate];
          
          const result = updateToolValue(tools, toolToUpdate.id, newValue);
          const updatedTool = result.find(t => t.id === toolToUpdate.id);
          
          expect(updatedTool).toBeDefined();
          if (updatedTool) {
            // Value should be clamped to [min, max]
            expect(updatedTool.value).toBeGreaterThanOrEqual(updatedTool.min);
            expect(updatedTool.value).toBeLessThanOrEqual(updatedTool.max);
            
            // Value should be the clamped version of newValue
            const expectedValue = Math.max(toolToUpdate.min, Math.min(toolToUpdate.max, newValue));
            expect(updatedTool.value).toBe(expectedValue);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('values within range are preserved exactly', () => {
    fc.assert(
      fc.property(
        validToolNameArb,
        (toolName) => {
          const config = TOOL_CONFIGS[toolName];
          const tool = createToolConfig(toolName)!;
          const tools = [tool];
          
          // Generate a value within the valid range
          const validValue = Math.floor((config.min + config.max) / 2);
          
          const result = updateToolValue(tools, toolName, validValue);
          const updatedTool = result.find(t => t.id === toolName);
          
          expect(updatedTool?.value).toBe(validValue);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: hud-tool-panel, Property 5: Tool Update Isolation**
 * **Validates: Requirements 5.1**
 * 
 * For any activeTools array and any tool update (id, newValue),
 * only the tool with matching id SHALL have its value changed;
 * all other tools SHALL remain unchanged.
 */
describe('Property 5: Tool Update Isolation', () => {
  it('updating one tool does not affect other tools', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb.filter(arr => arr.length >= 2),
        fc.nat(),
        fc.integer({ min: -100, max: 100 }),
        (tools, indexSeed, newValue) => {
          const indexToUpdate = indexSeed % tools.length;
          const toolToUpdate = tools[indexToUpdate];
          const otherTools = tools.filter((_, i) => i !== indexToUpdate);
          
          const result = updateToolValue(tools, toolToUpdate.id, newValue);
          
          // All other tools should be completely unchanged
          for (const otherTool of otherTools) {
            const found = result.find(t => t.id === otherTool.id);
            expect(found).toBeDefined();
            expect(found).toEqual(otherTool);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('updating a non-existent tool returns unchanged array', () => {
    fc.assert(
      fc.property(
        uniqueToolsArrayArb,
        fc.string({ minLength: 10, maxLength: 20 }),
        fc.integer({ min: -100, max: 100 }),
        (tools, fakeId, newValue) => {
          const result = updateToolValue(tools, fakeId, newValue);
          
          expect(result.length).toBe(tools.length);
          // All tools should be unchanged
          for (let i = 0; i < tools.length; i++) {
            expect(result[i]).toEqual(tools[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
