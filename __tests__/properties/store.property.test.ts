/**
 * Property-based tests for Zustand store actions
 * **Feature: optimization-architecture**
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
 */

import * as fc from 'fast-check';
import { useAppStore, ImageStateData } from '@/lib/store';
import { ActiveTool, ToolInput, TOOL_CONFIGS, ToolName } from '@/lib/types';

// Valid tool names for generating test data
const VALID_TOOL_NAMES: ToolName[] = ['blur', 'grayscale', 'sepia', 'contrast'];

// Arbitrary for generating valid tool names
const validToolNameArb = fc.constantFrom(...VALID_TOOL_NAMES);

// Arbitrary for generating tool inputs with optional initial values
const toolInputArb: fc.Arbitrary<ToolInput> = fc.record({
  name: validToolNameArb,
  initial_value: fc.option(fc.integer({ min: -200, max: 200 }), { nil: undefined }),
});

// Arbitrary for generating arrays of tool inputs
const toolInputsArb = fc.array(toolInputArb, { minLength: 1, maxLength: 4 });

// Arbitrary for generating ActiveTool objects
const activeToolArb: fc.Arbitrary<ActiveTool> = validToolNameArb.map((name) => {
  const config = TOOL_CONFIGS[name];
  return {
    id: config.id,
    label: config.label,
    value: config.defaultValue,
    min: config.min,
    max: config.max,
  };
});



// Arbitrary for ImageStateData
const imageStateDataArb: fc.Arbitrary<Partial<ImageStateData>> = fc.record({
  hasImage: fc.boolean(),
  width: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
  height: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
});

// Helper to reset store before each test
const resetStore = () => {
  useAppStore.setState({
    activeTools: [],
    imageState: { hasImage: false, width: null, height: null },
    processingStatus: 'idle',
  });
};

describe('Property 1: addTool appends tool to activeTools', () => {
  /**
   * **Feature: optimization-architecture, Property 1: addTool appends tool to activeTools**
   * 
   * For any valid tool input and any initial activeTools array, calling addTool 
   * should result in activeTools containing a tool with the specified id.
   * **Validates: Requirements 1.2**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should add valid tools to activeTools', () => {
    fc.assert(
      fc.property(toolInputsArb, (toolInputs) => {
        resetStore();
        
        const { addTool, activeTools: initialTools } = useAppStore.getState();
        expect(initialTools).toHaveLength(0);
        
        addTool(toolInputs);
        
        const { activeTools } = useAppStore.getState();
        
        // Each valid tool input should result in a tool being added
        const validInputs = toolInputs.filter(
          (input, index, arr) => 
            VALID_TOOL_NAMES.includes(input.name as ToolName) &&
            arr.findIndex(t => t.name === input.name) === index // first occurrence only
        );
        
        for (const input of validInputs) {
          const addedTool = activeTools.find(t => t.id === input.name);
          expect(addedTool).toBeDefined();
          expect(addedTool?.id).toBe(input.name);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should not add duplicate tools', () => {
    fc.assert(
      fc.property(validToolNameArb, (toolName) => {
        resetStore();
        
        const { addTool } = useAppStore.getState();
        
        // Add the same tool twice
        addTool([{ name: toolName }]);
        addTool([{ name: toolName }]);
        
        const { activeTools } = useAppStore.getState();
        
        // Should only have one instance of the tool
        const toolCount = activeTools.filter(t => t.id === toolName).length;
        expect(toolCount).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve existing tools when adding new ones', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolNameArb, validToolNameArb).filter(([a, b]) => a !== b),
        ([firstTool, secondTool]) => {
          resetStore();
          
          const { addTool } = useAppStore.getState();
          
          addTool([{ name: firstTool }]);
          const { activeTools: afterFirst } = useAppStore.getState();
          expect(afterFirst.some(t => t.id === firstTool)).toBe(true);
          
          addTool([{ name: secondTool }]);
          const { activeTools: afterSecond } = useAppStore.getState();
          
          // Both tools should be present
          expect(afterSecond.some(t => t.id === firstTool)).toBe(true);
          expect(afterSecond.some(t => t.id === secondTool)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Property 2: removeTool filters out specified tool', () => {
  /**
   * **Feature: optimization-architecture, Property 2: removeTool filters out specified tool**
   * 
   * For any activeTools array containing a tool with id X, calling removeTool(X) 
   * should result in activeTools not containing any tool with id X.
   * **Validates: Requirements 1.3**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should remove tool by id', () => {
    fc.assert(
      fc.property(validToolNameArb, (toolName) => {
        resetStore();
        
        const { addTool, removeTool } = useAppStore.getState();
        
        // Add a tool first
        addTool([{ name: toolName }]);
        const { activeTools: beforeRemove } = useAppStore.getState();
        expect(beforeRemove.some(t => t.id === toolName)).toBe(true);
        
        // Remove the tool
        removeTool(toolName);
        const { activeTools: afterRemove } = useAppStore.getState();
        
        // Tool should no longer be present
        expect(afterRemove.some(t => t.id === toolName)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve other tools when removing one', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolNameArb, validToolNameArb).filter(([a, b]) => a !== b),
        ([toolToKeep, toolToRemove]) => {
          resetStore();
          
          const { addTool, removeTool } = useAppStore.getState();
          
          // Add both tools
          addTool([{ name: toolToKeep }, { name: toolToRemove }]);
          
          // Remove one tool
          removeTool(toolToRemove);
          const { activeTools } = useAppStore.getState();
          
          // The kept tool should still be present
          expect(activeTools.some(t => t.id === toolToKeep)).toBe(true);
          // The removed tool should not be present
          expect(activeTools.some(t => t.id === toolToRemove)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be a no-op when removing non-existent tool', () => {
    fc.assert(
      fc.property(validToolNameArb, (toolName) => {
        resetStore();
        
        const { removeTool } = useAppStore.getState();
        const { activeTools: before } = useAppStore.getState();
        
        // Try to remove a tool that doesn't exist
        removeTool(toolName);
        const { activeTools: after } = useAppStore.getState();
        
        // Array should be unchanged
        expect(after).toEqual(before);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 3: updateToolValue clamps to min/max range', () => {
  /**
   * **Feature: optimization-architecture, Property 3: updateToolValue clamps to min/max range**
   * 
   * For any tool in activeTools and any numeric value V, calling updateToolValue 
   * should result in the tool's value being clamped to [min, max] range.
   * **Validates: Requirements 1.4**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should clamp values to tool min/max range', () => {
    fc.assert(
      fc.property(
        validToolNameArb,
        fc.integer({ min: -500, max: 500 }),
        (toolName, newValue) => {
          resetStore();
          
          const { addTool, updateToolValue } = useAppStore.getState();
          
          // Add a tool
          addTool([{ name: toolName }]);
          
          // Update with arbitrary value
          updateToolValue(toolName, newValue);
          const { activeTools } = useAppStore.getState();
          
          const tool = activeTools.find(t => t.id === toolName);
          expect(tool).toBeDefined();
          
          if (tool) {
            // Value should be clamped to [min, max]
            expect(tool.value).toBeGreaterThanOrEqual(tool.min);
            expect(tool.value).toBeLessThanOrEqual(tool.max);
            
            // Value should be the clamped version of newValue
            const expectedValue = Math.max(tool.min, Math.min(tool.max, newValue));
            expect(tool.value).toBe(expectedValue);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve values within valid range', () => {
    fc.assert(
      fc.property(validToolNameArb, (toolName) => {
        resetStore();
        
        const config = TOOL_CONFIGS[toolName];
        const validValue = Math.floor((config.min + config.max) / 2);
        
        const { addTool, updateToolValue } = useAppStore.getState();
        
        addTool([{ name: toolName }]);
        updateToolValue(toolName, validValue);
        
        const { activeTools } = useAppStore.getState();
        const tool = activeTools.find(t => t.id === toolName);
        
        expect(tool?.value).toBe(validValue);
      }),
      { numRuns: 100 }
    );
  });

  it('should not affect other tools when updating one', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolNameArb, validToolNameArb).filter(([a, b]) => a !== b),
        fc.integer({ min: -500, max: 500 }),
        ([toolToUpdate, otherTool], newValue) => {
          resetStore();
          
          const { addTool, updateToolValue } = useAppStore.getState();
          
          // Add both tools
          addTool([{ name: toolToUpdate }, { name: otherTool }]);
          const { activeTools: before } = useAppStore.getState();
          const otherToolBefore = before.find(t => t.id === otherTool);
          
          // Update one tool
          updateToolValue(toolToUpdate, newValue);
          const { activeTools: after } = useAppStore.getState();
          const otherToolAfter = after.find(t => t.id === otherTool);
          
          // Other tool should be unchanged
          expect(otherToolAfter?.value).toBe(otherToolBefore?.value);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 4: setImageState updates store correctly', () => {
  /**
   * **Feature: optimization-architecture, Property 4: setImageState updates store correctly**
   * 
   * For any partial ImageStateData object, calling setImageState should result 
   * in the store containing those values merged with existing state.
   * **Validates: Requirements 1.5**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should merge partial state with existing state', () => {
    fc.assert(
      fc.property(imageStateDataArb, (partialState) => {
        resetStore();
        
        const { setImageState } = useAppStore.getState();
        
        setImageState(partialState);
        const { imageState: after } = useAppStore.getState();
        
        // Each provided property should be updated
        if (partialState.hasImage !== undefined) {
          expect(after.hasImage).toBe(partialState.hasImage);
        }
        if (partialState.width !== undefined) {
          expect(after.width).toBe(partialState.width);
        }
        if (partialState.height !== undefined) {
          expect(after.height).toBe(partialState.height);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve unspecified properties', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 1, max: 10000 }),
        (hasImage, width) => {
          resetStore();
          
          const { setImageState } = useAppStore.getState();
          
          // Set initial state
          setImageState({ hasImage: true, width: 800, height: 600 });
          
          // Update only hasImage
          setImageState({ hasImage });
          const { imageState: afterHasImage } = useAppStore.getState();
          
          // width and height should be preserved
          expect(afterHasImage.width).toBe(800);
          expect(afterHasImage.height).toBe(600);
          expect(afterHasImage.hasImage).toBe(hasImage);
          
          // Update only width
          setImageState({ width });
          const { imageState: afterWidth } = useAppStore.getState();
          
          // hasImage and height should be preserved
          expect(afterWidth.hasImage).toBe(hasImage);
          expect(afterWidth.height).toBe(600);
          expect(afterWidth.width).toBe(width);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty partial state', () => {
    resetStore();
    
    const { setImageState } = useAppStore.getState();
    
    // Set initial state
    setImageState({ hasImage: true, width: 1920, height: 1080 });
    const { imageState: before } = useAppStore.getState();
    
    // Update with empty object
    setImageState({});
    const { imageState: after } = useAppStore.getState();
    
    // State should be unchanged
    expect(after).toEqual(before);
  });
});
