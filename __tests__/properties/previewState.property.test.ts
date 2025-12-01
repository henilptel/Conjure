/**
 * Property-based tests for preview state management in the store
 * 
 * Tests the preview state flow for CSS filter optimization:
 * - startPreview: initializes preview mode
 * - updatePreviewValue: updates preview without triggering WASM
 * - commitPreview: applies preview values to activeTools
 * - cancelPreview: reverts to original values
 */

import * as fc from 'fast-check';
import { useAppStore } from '@/lib/store';
import type { ActiveTool } from '@/lib/types';
import { TOOL_REGISTRY } from '@/lib/tools-registry';

// ============================================================================
// Arbitraries
// ============================================================================

const arbToolId = fc.constantFrom(...Object.keys(TOOL_REGISTRY));

const arbActiveTool = (toolId: string): fc.Arbitrary<ActiveTool> => {
  const config = TOOL_REGISTRY[toolId];
  return fc.integer({ min: config.min, max: config.max }).map(value => ({
    id: config.id,
    label: config.label,
    value,
    min: config.min,
    max: config.max,
  }));
};

const arbActiveTools: fc.Arbitrary<ActiveTool[]> = fc.array(
  arbToolId,
  { minLength: 1, maxLength: 5 }
).chain(toolIds => {
  const uniqueIds = [...new Set(toolIds)];
  return fc.tuple(...uniqueIds.map(id => arbActiveTool(id)));
});

// ============================================================================
// Test Setup
// ============================================================================

function resetStore() {
  useAppStore.setState({
    activeTools: [],
    imageState: { hasImage: false, width: null, height: null },
    processingStatus: 'idle',
    isCompareMode: false,
    previewState: {
      isDragging: false,
      draggingToolId: null,
      previewTools: [],
    },
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Preview State Management', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('Initial State', () => {
    it('previewState starts with isDragging false', () => {
      const state = useAppStore.getState();
      expect(state.previewState.isDragging).toBe(false);
      expect(state.previewState.draggingToolId).toBeNull();
      expect(state.previewState.previewTools).toEqual([]);
    });
  });

  describe('startPreview', () => {
    it('property: sets isDragging to true', () => {
      fc.assert(
        fc.property(arbActiveTools, arbToolId, (tools, toolId) => {
          resetStore();
          useAppStore.setState({ activeTools: tools });
          
          useAppStore.getState().startPreview(toolId);
          
          const state = useAppStore.getState();
          expect(state.previewState.isDragging).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('property: copies activeTools to previewTools', () => {
      fc.assert(
        fc.property(arbActiveTools, arbToolId, (tools, toolId) => {
          resetStore();
          useAppStore.setState({ activeTools: tools });
          
          useAppStore.getState().startPreview(toolId);
          
          const state = useAppStore.getState();
          expect(state.previewState.previewTools).toEqual(tools);
        }),
        { numRuns: 20 }
      );
    });

    it('property: sets draggingToolId', () => {
      fc.assert(
        fc.property(arbActiveTools, arbToolId, (tools, toolId) => {
          resetStore();
          useAppStore.setState({ activeTools: tools });
          
          useAppStore.getState().startPreview(toolId);
          
          const state = useAppStore.getState();
          expect(state.previewState.draggingToolId).toBe(toolId);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('updatePreviewValue', () => {
    it('property: updates only previewTools, not activeTools', () => {
      fc.assert(
        fc.property(
          arbActiveTools.filter(t => t.length > 0),
          fc.integer({ min: 0, max: 200 }),
          (tools, newValue) => {
            resetStore();
            useAppStore.setState({ activeTools: tools });
            
            const toolId = tools[0].id;
            useAppStore.getState().startPreview(toolId);
            useAppStore.getState().updatePreviewValue(toolId, newValue);
            
            const state = useAppStore.getState();
            
            // activeTools should be unchanged
            expect(state.activeTools).toEqual(tools);
            
            // previewTools should have updated value (clamped)
            const previewTool = state.previewState.previewTools.find(t => t.id === toolId);
            expect(previewTool).toBeDefined();
            
            // Value should be clamped to min/max
            const config = TOOL_REGISTRY[toolId];
            const expectedValue = Math.max(config.min, Math.min(config.max, newValue));
            expect(previewTool!.value).toBe(expectedValue);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('commitPreview', () => {
    it('property: applies previewTools to activeTools', () => {
      fc.assert(
        fc.property(
          arbActiveTools.filter(t => t.length > 0),
          fc.integer({ min: 0, max: 200 }),
          (tools, newValue) => {
            resetStore();
            useAppStore.setState({ activeTools: tools });
            
            const toolId = tools[0].id;
            useAppStore.getState().startPreview(toolId);
            useAppStore.getState().updatePreviewValue(toolId, newValue);
            
            const previewToolsBefore = [...useAppStore.getState().previewState.previewTools];
            
            useAppStore.getState().commitPreview();
            
            const state = useAppStore.getState();
            
            // activeTools should match previewTools before commit
            expect(state.activeTools).toEqual(previewToolsBefore);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('property: resets preview state after commit', () => {
      fc.assert(
        fc.property(arbActiveTools, arbToolId, (tools, toolId) => {
          resetStore();
          useAppStore.setState({ activeTools: tools });
          
          useAppStore.getState().startPreview(toolId);
          useAppStore.getState().commitPreview();
          
          const state = useAppStore.getState();
          expect(state.previewState.isDragging).toBe(false);
          expect(state.previewState.draggingToolId).toBeNull();
          expect(state.previewState.previewTools).toEqual([]);
        }),
        { numRuns: 20 }
      );
    });

    it('does nothing if not in preview mode', () => {
      resetStore();
      const initialTools: ActiveTool[] = [
        { id: 'blur', label: 'Blur', value: 5, min: 0, max: 20 }
      ];
      useAppStore.setState({ activeTools: initialTools });
      
      useAppStore.getState().commitPreview();
      
      const state = useAppStore.getState();
      expect(state.activeTools).toEqual(initialTools);
    });
  });

  describe('cancelPreview', () => {
    it('property: does not modify activeTools', () => {
      fc.assert(
        fc.property(
          arbActiveTools.filter(t => t.length > 0),
          fc.integer({ min: 0, max: 200 }),
          (tools, newValue) => {
            resetStore();
            useAppStore.setState({ activeTools: tools });
            
            const originalTools = [...tools];
            const toolId = tools[0].id;
            
            useAppStore.getState().startPreview(toolId);
            useAppStore.getState().updatePreviewValue(toolId, newValue);
            useAppStore.getState().cancelPreview();
            
            const state = useAppStore.getState();
            expect(state.activeTools).toEqual(originalTools);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('property: resets preview state', () => {
      fc.assert(
        fc.property(arbActiveTools, arbToolId, (tools, toolId) => {
          resetStore();
          useAppStore.setState({ activeTools: tools });
          
          useAppStore.getState().startPreview(toolId);
          useAppStore.getState().cancelPreview();
          
          const state = useAppStore.getState();
          expect(state.previewState.isDragging).toBe(false);
          expect(state.previewState.draggingToolId).toBeNull();
          expect(state.previewState.previewTools).toEqual([]);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('resetTools', () => {
    it('property: also clears preview state', () => {
      fc.assert(
        fc.property(arbActiveTools, arbToolId, (tools, toolId) => {
          resetStore();
          useAppStore.setState({ activeTools: tools });
          
          useAppStore.getState().startPreview(toolId);
          useAppStore.getState().resetTools();
          
          const state = useAppStore.getState();
          expect(state.activeTools).toEqual([]);
          expect(state.previewState.isDragging).toBe(false);
          expect(state.previewState.previewTools).toEqual([]);
        }),
        { numRuns: 20 }
      );
    });
  });
});
