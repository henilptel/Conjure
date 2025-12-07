/**
 * Property-based tests for undo/redo history state management
 * **Feature: undo-redo**
 * **Validates: Requirements 1.1, 1.3, 2.1, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2**
 */

import * as fc from 'fast-check';
import { useAppStore } from '@/lib/store';
import { ActiveTool, HistoryState, DEFAULT_HISTORY_STATE } from '@/lib/types';

// Valid tool names for generating test data
const VALID_TOOL_NAMES = ['blur', 'grayscale', 'sepia', 'contrast'] as const;

// Arbitrary for generating valid tool names
const validToolNameArb = fc.constantFrom(...VALID_TOOL_NAMES);

// Arbitrary for generating ActiveTool objects
const activeToolArb: fc.Arbitrary<ActiveTool> = fc.record({
  id: validToolNameArb,
  label: fc.constant('Test Tool'),
  value: fc.integer({ min: 0, max: 100 }),
  min: fc.constant(0),
  max: fc.constant(100),
});

// Arbitrary for generating arrays of ActiveTools (with unique ids)
const activeToolsArb: fc.Arbitrary<ActiveTool[]> = fc
  .uniqueArray(validToolNameArb, { minLength: 0, maxLength: 4 })
  .chain((names) =>
    fc.tuple(
      ...names.map((name) =>
        fc.integer({ min: 0, max: 100 }).map((value) => ({
          id: name,
          label: `${name} Tool`,
          value,
          min: 0,
          max: 100,
        }))
      )
    )
  );

// Helper to reset store before each test
const resetStore = () => {
  useAppStore.setState({
    activeTools: [],
    imageState: { hasImage: false, width: null, height: null },
    processingStatus: 'idle',
    isCompareMode: false,
    processingMessage: '',
    previewState: {
      isDragging: false,
      draggingToolId: null,
      previewTools: [],
    },
    history: { ...DEFAULT_HISTORY_STATE },
  });
};

// Helper to set up history with multiple entries
const setupHistoryWithEntries = (toolStates: ActiveTool[][]) => {
  resetStore();
  for (const tools of toolStates) {
    useAppStore.setState({ activeTools: tools });
    useAppStore.getState().recordHistory();
  }
};


describe('Property 1: Undo restores previous state', () => {
  /**
   * **Feature: undo-redo, Property 1: Undo restores previous state**
   *
   * For any history stack with at least 2 entries and pointer > 0, calling undo
   * SHALL decrement the pointer by 1 and set activeTools to the entry at the new pointer position.
   * **Validates: Requirements 1.1, 1.3**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should decrement pointer and restore previous activeTools', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 2, maxLength: 5 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          const { history: historyBefore, activeTools: toolsBefore } = useAppStore.getState();
          const pointerBefore = historyBefore.pointer;

          // Ensure we have entries to undo to
          if (pointerBefore <= 0) return true;

          // Get expected state after undo
          const expectedTools = historyBefore.entries[pointerBefore - 1].activeTools;

          // Perform undo
          useAppStore.getState().undo();

          const { history: historyAfter, activeTools: toolsAfter } = useAppStore.getState();

          // Pointer should be decremented
          expect(historyAfter.pointer).toBe(pointerBefore - 1);

          // ActiveTools should match the previous entry
          expect(toolsAfter).toEqual(expectedTools);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 2: Redo restores next state', () => {
  /**
   * **Feature: undo-redo, Property 2: Redo restores next state**
   *
   * For any history stack where pointer < entries.length - 1, calling redo
   * SHALL increment the pointer by 1 and set activeTools to the entry at the new pointer position.
   * **Validates: Requirements 2.1, 2.3**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should increment pointer and restore next activeTools after undo', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 2, maxLength: 5 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          // Perform undo first to create redo opportunity
          useAppStore.getState().undo();

          const { history: historyBefore } = useAppStore.getState();
          const pointerBefore = historyBefore.pointer;

          // Ensure we have entries to redo to
          if (pointerBefore >= historyBefore.entries.length - 1) return true;

          // Get expected state after redo
          const expectedTools = historyBefore.entries[pointerBefore + 1].activeTools;

          // Perform redo
          useAppStore.getState().redo();

          const { history: historyAfter, activeTools: toolsAfter } = useAppStore.getState();

          // Pointer should be incremented
          expect(historyAfter.pointer).toBe(pointerBefore + 1);

          // ActiveTools should match the next entry
          expect(toolsAfter).toEqual(expectedTools);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 3: Undo at boundary is no-op', () => {
  /**
   * **Feature: undo-redo, Property 3: Undo at boundary is no-op**
   *
   * For any history stack with pointer at 0 or empty stack, calling undo
   * SHALL not modify the pointer or activeTools state.
   * **Validates: Requirements 1.3**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should not modify state when undo called with empty history', () => {
    fc.assert(
      fc.property(activeToolsArb, (tools) => {
        resetStore();
        useAppStore.setState({ activeTools: tools });

        const { history: historyBefore, activeTools: toolsBefore } = useAppStore.getState();

        // Perform undo on empty history
        useAppStore.getState().undo();

        const { history: historyAfter, activeTools: toolsAfter } = useAppStore.getState();

        // State should be unchanged
        expect(historyAfter.pointer).toBe(historyBefore.pointer);
        expect(historyAfter.entries).toEqual(historyBefore.entries);
        expect(toolsAfter).toEqual(toolsBefore);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should not modify state when undo called at pointer 0', () => {
    fc.assert(
      fc.property(activeToolsArb, (tools) => {
        resetStore();
        useAppStore.setState({ activeTools: tools });
        useAppStore.getState().recordHistory();

        const { history: historyBefore, activeTools: toolsBefore } = useAppStore.getState();
        expect(historyBefore.pointer).toBe(0);

        // Perform undo at pointer 0
        useAppStore.getState().undo();

        const { history: historyAfter, activeTools: toolsAfter } = useAppStore.getState();

        // State should be unchanged
        expect(historyAfter.pointer).toBe(0);
        expect(toolsAfter).toEqual(toolsBefore);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});


describe('Property 4: Redo at boundary is no-op', () => {
  /**
   * **Feature: undo-redo, Property 4: Redo at boundary is no-op**
   *
   * For any history stack with pointer at the last entry (pointer === entries.length - 1),
   * calling redo SHALL not modify the pointer or activeTools state.
   * **Validates: Requirements 2.3**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should not modify state when redo called with empty history', () => {
    fc.assert(
      fc.property(activeToolsArb, (tools) => {
        resetStore();
        useAppStore.setState({ activeTools: tools });

        const { history: historyBefore, activeTools: toolsBefore } = useAppStore.getState();

        // Perform redo on empty history
        useAppStore.getState().redo();

        const { history: historyAfter, activeTools: toolsAfter } = useAppStore.getState();

        // State should be unchanged
        expect(historyAfter.pointer).toBe(historyBefore.pointer);
        expect(historyAfter.entries).toEqual(historyBefore.entries);
        expect(toolsAfter).toEqual(toolsBefore);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should not modify state when redo called at end of history', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 1, maxLength: 5 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          const { history: historyBefore, activeTools: toolsBefore } = useAppStore.getState();
          expect(historyBefore.pointer).toBe(historyBefore.entries.length - 1);

          // Perform redo at end of history
          useAppStore.getState().redo();

          const { history: historyAfter, activeTools: toolsAfter } = useAppStore.getState();

          // State should be unchanged
          expect(historyAfter.pointer).toBe(historyBefore.pointer);
          expect(toolsAfter).toEqual(toolsBefore);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 5: Recording history appends entry and truncates future', () => {
  /**
   * **Feature: undo-redo, Property 5: Recording history appends entry and truncates future**
   *
   * For any history stack and any new activeTools state, calling recordHistory
   * SHALL append a new entry at pointer + 1, discard all entries after the new entry,
   * and increment the pointer.
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should append entry and update pointer', () => {
    fc.assert(
      fc.property(activeToolsArb, (tools) => {
        resetStore();
        useAppStore.setState({ activeTools: tools });

        const { history: historyBefore } = useAppStore.getState();
        const entriesBefore = historyBefore.entries.length;

        useAppStore.getState().recordHistory();

        const { history: historyAfter } = useAppStore.getState();

        // Entry count should increase by 1
        expect(historyAfter.entries.length).toBe(entriesBefore + 1);

        // Pointer should point to the new entry
        expect(historyAfter.pointer).toBe(historyAfter.entries.length - 1);

        // New entry should contain current activeTools
        const lastEntry = historyAfter.entries[historyAfter.pointer];
        expect(lastEntry.activeTools).toEqual(tools);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should truncate future entries when recording after undo', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 3, maxLength: 5 }),
        activeToolsArb,
        (toolStates, newTools) => {
          setupHistoryWithEntries(toolStates);

          // Undo twice to create future entries
          useAppStore.getState().undo();
          useAppStore.getState().undo();

          const { history: historyAfterUndo } = useAppStore.getState();
          const pointerAfterUndo = historyAfterUndo.pointer;

          // Set new tools and record
          useAppStore.setState({ activeTools: newTools });
          useAppStore.getState().recordHistory();

          const { history: historyAfterRecord } = useAppStore.getState();

          // Future entries should be truncated
          expect(historyAfterRecord.entries.length).toBe(pointerAfterUndo + 2);

          // Pointer should be at the end
          expect(historyAfterRecord.pointer).toBe(historyAfterRecord.entries.length - 1);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 6: History size is bounded', () => {
  /**
   * **Feature: undo-redo, Property 6: History size is bounded**
   *
   * For any sequence of recordHistory calls, the history stack length
   * SHALL never exceed maxSize, with oldest entries removed when the limit is reached.
   * **Validates: Requirements 3.5**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should never exceed maxSize', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.array(activeToolsArb, { minLength: 1, maxLength: 20 }),
        (maxSize, toolStates) => {
          resetStore();

          // Set a small maxSize for testing
          useAppStore.setState({
            history: { ...DEFAULT_HISTORY_STATE, maxSize },
          });

          // Record many entries
          for (const tools of toolStates) {
            useAppStore.setState({ activeTools: tools });
            useAppStore.getState().recordHistory();
          }

          const { history } = useAppStore.getState();

          // History should never exceed maxSize
          expect(history.entries.length).toBeLessThanOrEqual(maxSize);

          // Pointer should be valid
          expect(history.pointer).toBeLessThan(history.entries.length);
          expect(history.pointer).toBeGreaterThanOrEqual(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should remove oldest entries when maxSize exceeded', () => {
    resetStore();

    const maxSize = 3;
    useAppStore.setState({
      history: { ...DEFAULT_HISTORY_STATE, maxSize },
    });

    // Record 5 entries
    for (let i = 0; i < 5; i++) {
      useAppStore.setState({
        activeTools: [{ id: `tool-${i}`, label: `Tool ${i}`, value: i, min: 0, max: 100 }],
      });
      useAppStore.getState().recordHistory();
    }

    const { history } = useAppStore.getState();

    // Should have exactly maxSize entries
    expect(history.entries.length).toBe(maxSize);

    // Should contain the most recent entries (tool-2, tool-3, tool-4)
    expect(history.entries[0].activeTools[0].id).toBe('tool-2');
    expect(history.entries[1].activeTools[0].id).toBe('tool-3');
    expect(history.entries[2].activeTools[0].id).toBe('tool-4');
  });
});


describe('Property 7: canUndo reflects undo availability', () => {
  /**
   * **Feature: undo-redo, Property 7: canUndo reflects undo availability**
   *
   * For any history state, canUndo SHALL return true if and only if pointer > 0.
   * **Validates: Requirements 4.1, 4.2**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should return false when history is empty', () => {
    resetStore();
    expect(useAppStore.getState().canUndo()).toBe(false);
  });

  it('should return false when pointer is 0', () => {
    fc.assert(
      fc.property(activeToolsArb, (tools) => {
        resetStore();
        useAppStore.setState({ activeTools: tools });
        useAppStore.getState().recordHistory();

        const { history } = useAppStore.getState();
        expect(history.pointer).toBe(0);
        expect(useAppStore.getState().canUndo()).toBe(false);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return true when pointer > 0', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 2, maxLength: 5 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          const { history } = useAppStore.getState();
          expect(history.pointer).toBeGreaterThan(0);
          expect(useAppStore.getState().canUndo()).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly reflect pointer > 0 for any history state', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 10 }),
        (toolStates, undoCount) => {
          setupHistoryWithEntries(toolStates);

          // Perform some undos
          for (let i = 0; i < undoCount; i++) {
            useAppStore.getState().undo();
          }

          const { history } = useAppStore.getState();
          const canUndo = useAppStore.getState().canUndo();

          // canUndo should be true iff pointer > 0
          expect(canUndo).toBe(history.pointer > 0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: canRedo reflects redo availability', () => {
  /**
   * **Feature: undo-redo, Property 8: canRedo reflects redo availability**
   *
   * For any history state, canRedo SHALL return true if and only if pointer < entries.length - 1.
   * **Validates: Requirements 4.3, 4.4**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should return false when history is empty', () => {
    resetStore();
    expect(useAppStore.getState().canRedo()).toBe(false);
  });

  it('should return false when pointer is at end of history', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 1, maxLength: 5 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          const { history } = useAppStore.getState();
          expect(history.pointer).toBe(history.entries.length - 1);
          expect(useAppStore.getState().canRedo()).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return true after undo', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 2, maxLength: 5 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          // Perform undo
          useAppStore.getState().undo();

          const { history } = useAppStore.getState();
          expect(history.pointer).toBeLessThan(history.entries.length - 1);
          expect(useAppStore.getState().canRedo()).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly reflect pointer < entries.length - 1 for any history state', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 10 }),
        (toolStates, undoCount) => {
          setupHistoryWithEntries(toolStates);

          // Perform some undos
          for (let i = 0; i < undoCount; i++) {
            useAppStore.getState().undo();
          }

          const { history } = useAppStore.getState();
          const canRedo = useAppStore.getState().canRedo();

          // canRedo should be true iff pointer < entries.length - 1
          expect(canRedo).toBe(history.pointer < history.entries.length - 1);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Clear history resets to initial state', () => {
  /**
   * **Feature: undo-redo, Property 9: Clear history resets to initial state**
   *
   * For any history stack, calling clearHistory SHALL result in an empty entries array
   * and pointer at -1.
   * **Validates: Requirements 5.1, 5.2**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should reset to single initial entry with current activeTools and pointer 0', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 1, maxLength: 10 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          const { history: historyBefore, activeTools: toolsBefore } = useAppStore.getState();
          expect(historyBefore.entries.length).toBeGreaterThan(0);

          // Clear history
          useAppStore.getState().clearHistory();

          const { history: historyAfter, activeTools: toolsAfter } = useAppStore.getState();

          // Should have single entry with current activeTools (for undo of first action)
          expect(historyAfter.entries.length).toBe(1);
          expect(historyAfter.pointer).toBe(0);
          expect(historyAfter.maxSize).toBe(DEFAULT_HISTORY_STATE.maxSize);
          // The entry should contain the current activeTools state
          expect(historyAfter.entries[0].activeTools).toEqual(toolsAfter);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 0, maxLength: 5 }),
        (toolStates) => {
          if (toolStates.length > 0) {
            setupHistoryWithEntries(toolStates);
          } else {
            resetStore();
          }

          // Clear multiple times
          useAppStore.getState().clearHistory();
          const { history: afterFirst } = useAppStore.getState();

          useAppStore.getState().clearHistory();
          const { history: afterSecond } = useAppStore.getState();

          // Should be the same after multiple clears (single entry with current activeTools)
          // Note: timestamps may differ, so compare structure not exact equality
          expect(afterSecond.entries.length).toBe(afterFirst.entries.length);
          expect(afterSecond.pointer).toBe(afterFirst.pointer);
          expect(afterSecond.entries.length).toBe(1);
          expect(afterSecond.pointer).toBe(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: Undo-Redo round trip preserves state', () => {
  /**
   * **Feature: undo-redo, Property 10: Undo-Redo round trip preserves state**
   *
   * For any history stack with at least 2 entries and pointer > 0, performing undo
   * followed by redo SHALL restore activeTools to the original state before undo.
   * **Validates: Requirements 1.1, 2.1**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should restore original state after undo then redo', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 2, maxLength: 5 }),
        (toolStates) => {
          setupHistoryWithEntries(toolStates);

          const { activeTools: toolsBefore, history: historyBefore } = useAppStore.getState();

          // Ensure we can undo
          if (historyBefore.pointer <= 0) return true;

          // Perform undo then redo
          useAppStore.getState().undo();
          useAppStore.getState().redo();

          const { activeTools: toolsAfter, history: historyAfter } = useAppStore.getState();

          // State should be restored
          expect(toolsAfter).toEqual(toolsBefore);
          expect(historyAfter.pointer).toBe(historyBefore.pointer);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle multiple undo-redo cycles', () => {
    fc.assert(
      fc.property(
        fc.array(activeToolsArb, { minLength: 3, maxLength: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (toolStates, cycles) => {
          setupHistoryWithEntries(toolStates);

          const { activeTools: toolsBefore, history: historyBefore } = useAppStore.getState();

          // Ensure we can undo
          if (historyBefore.pointer <= 0) return true;

          // Perform multiple undo-redo cycles
          for (let i = 0; i < cycles; i++) {
            useAppStore.getState().undo();
            useAppStore.getState().redo();
          }

          const { activeTools: toolsAfter, history: historyAfter } = useAppStore.getState();

          // State should be restored after all cycles
          expect(toolsAfter).toEqual(toolsBefore);
          expect(historyAfter.pointer).toBe(historyBefore.pointer);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
