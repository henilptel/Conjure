/**
 * Zustand store for centralized state management
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
import { create } from 'zustand';
import { 
  ActiveTool, 
  ToolInput, 
  addToolsWithValues, 
  removeTool as removeToolFromArray, 
  updateToolValue as updateToolValueInArray,
  HistoryState,
  HistoryEntry,
  DEFAULT_HISTORY_STATE,
} from './types';

/**
 * Image state data shared between components
 */
export interface ImageStateData {
  hasImage: boolean;
  width: number | null;
  height: number | null;
}

/**
 * Processing status for image operations
 */
export type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

/**
 * Preview mode for CSS filter-based instant feedback during slider drag
 */
export interface PreviewState {
  /** Whether user is actively dragging a slider */
  isDragging: boolean;
  /** Tool ID currently being dragged (for targeted CSS preview) */
  draggingToolId: string | null;
  /** Preview tool values (may differ from committed activeTools during drag) */
  previewTools: ActiveTool[];
  /** Snapshot of activeTools at preview start, for restoration on cancel */
  originalActiveTools: ActiveTool[];
}

/**
 * Application state interface
 */
export interface AppState {
  // State
  activeTools: ActiveTool[];
  imageState: ImageStateData;
  processingStatus: ProcessingStatus;
  isCompareMode: boolean;
  processingMessage: string;
  
  // Preview state for CSS filter optimization
  previewState: PreviewState;
  
  // History state for undo/redo functionality
  history: HistoryState;
  
  // Actions
  addTool: (toolInputs: ToolInput[]) => void;
  removeTool: (toolId: string) => void;
  updateToolValue: (toolId: string, value: number) => void;
  setImageState: (state: Partial<ImageStateData>) => void;
  setProcessingStatus: (status: ProcessingStatus) => void;
  setCompareMode: (enabled: boolean) => void;
  setProcessingMessage: (msg: string) => void;
  resetTools: () => void;
  
  // Preview actions for CSS filter optimization
  startPreview: (toolId: string) => void;
  updatePreviewValue: (toolId: string, value: number) => void;
  commitPreview: (finalToolId?: string, finalValue?: number) => void;
  cancelPreview: () => void;
  
  // History actions for undo/redo functionality
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  recordHistory: () => void;
  clearHistory: () => void;
}

/**
 * Default image state
 */
const defaultImageState: ImageStateData = {
  hasImage: false,
  width: null,
  height: null,
};

/**
 * Default preview state
 */
const defaultPreviewState: PreviewState = {
  isDragging: false,
  draggingToolId: null,
  previewTools: [],
  originalActiveTools: [],
};

/**
 * Creates a deep copy of activeTools for history entry
 */
function createHistoryEntry(activeTools: ActiveTool[]): HistoryEntry {
  return {
    activeTools: activeTools.map(tool => ({ ...tool })),
    timestamp: Date.now(),
  };
}

/**
 * Zustand store for application state
 * Provides centralized state management for activeTools, imageState, and processingStatus
 */
export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  activeTools: [],
  imageState: defaultImageState,
  processingStatus: 'idle',
  isCompareMode: false,
  processingMessage: '',
  previewState: defaultPreviewState,
  history: { ...DEFAULT_HISTORY_STATE },
  
  // Actions
  
  /**
   * Add tools to activeTools array
   * Uses existing addToolsWithValues logic for deduplication and validation
   * Records history after successful tool addition
   * Requirements: 1.2, 3.1
   */
  addTool: (toolInputs: ToolInput[]) => {
    set((state) => ({
      activeTools: addToolsWithValues(state.activeTools, toolInputs),
    }));
    // Record history after tool addition
    get().recordHistory();
  },
  
  /**
   * Remove a tool from activeTools by id
   * Uses existing removeTool logic
   * Records history after successful tool removal
   * Requirements: 1.3, 3.2
   */
  removeTool: (toolId: string) => {
    set((state) => ({
      activeTools: removeToolFromArray(state.activeTools, toolId),
    }));
    // Record history after tool removal
    get().recordHistory();
  },
  
  /**
   * Update a tool's value with clamping to min/max range
   * Uses existing updateToolValue logic
   * Requirements: 1.4
   */
  updateToolValue: (toolId: string, value: number) => {
    set((state) => ({
      activeTools: updateToolValueInArray(state.activeTools, toolId, value),
    }));
  },
  
  /**
   * Update image state with partial data
   * Merges provided values with existing state
   * Requirements: 1.5
   */
  setImageState: (newState: Partial<ImageStateData>) => {
    set((state) => ({
      imageState: { ...state.imageState, ...newState },
    }));
  },
  
  /**
   * Set processing status
   */
  setProcessingStatus: (status: ProcessingStatus) => {
    set({ processingStatus: status });
  },
  
  /**
   * Set compare mode state
   * When enabled, displays original unprocessed image
   * Requirements: 6.1, 6.2
   */
  setCompareMode: (enabled: boolean) => {
    set({ isCompareMode: enabled });
  },
  
  /**
   * Set processing message for dynamic feedback
   * Requirements: 3.1
   */
  setProcessingMessage: (msg: string) => {
    set({ processingMessage: msg });
  },
  
  /**
   * Reset tools to empty array
   * Records history with empty state after reset (only if there were tools to reset)
   * Requirements: 5.3
   */
  resetTools: () => {
    const { activeTools } = get();
    // Only record history if there were tools to reset
    const hadTools = activeTools.length > 0;
    
    set({ activeTools: [], previewState: defaultPreviewState });
    
    // Record history only if we actually reset something
    if (hadTools) {
      get().recordHistory();
    }
  },
  
  // Preview actions for CSS filter optimization
  
  /**
   * Start preview mode when user begins dragging a slider.
   * Copies current activeTools to previewTools for CSS-based preview.
   * Also captures a snapshot of activeTools for restoration on cancel.
   * Idempotent: only starts if not already in preview mode.
   */
  startPreview: (toolId: string) => {
    const { activeTools, previewState } = get();
    // Only start preview if not already dragging (idempotent)
    if (previewState.isDragging) return;
    
    // Capture snapshot of activeTools for potential restoration on cancel
    const snapshot = activeTools.map(tool => ({ ...tool }));
    
    set({
      previewState: {
        isDragging: true,
        draggingToolId: toolId,
        previewTools: snapshot,
        originalActiveTools: snapshot.map(tool => ({ ...tool })),
      },
    });
  },
  
  /**
   * Update preview value during drag without triggering WASM processing.
   * Only updates previewTools, not activeTools.
   */
  updatePreviewValue: (toolId: string, value: number) => {
    set((state) => ({
      previewState: {
        ...state.previewState,
        previewTools: updateToolValueInArray(state.previewState.previewTools, toolId, value),
      },
    }));
  },
  
  /**
   * Commit preview values to activeTools when user releases slider.
   * This triggers the final WASM processing via the activeTools effect.
   * Records history after preview is committed to activeTools.
   * 
   * Since updateToolValue updates activeTools directly during drag,
   * we use the current activeTools state (with final value applied if provided).
   * 
   * @param finalToolId - Optional tool ID to ensure correct final value
   * @param finalValue - Optional final value to use (ensures no race condition)
   * Requirements: 3.3
   */
  commitPreview: (finalToolId?: string, finalValue?: number) => {
    const { previewState, activeTools } = get();
    if (!previewState.isDragging) return;
    
    // Use current activeTools (already updated during drag)
    // Apply final value if provided to ensure no race condition
    let toolsToCommit = activeTools.map(tool => ({ ...tool }));
    if (finalToolId !== undefined && finalValue !== undefined) {
      toolsToCommit = updateToolValueInArray(toolsToCommit, finalToolId, finalValue);
    }
    
    set({
      activeTools: toolsToCommit,
      previewState: defaultPreviewState,
    });
    // Record history after slider value commit
    get().recordHistory();
  },
  
  /**
   * Cancel preview and revert activeTools to the state before drag started.
   * Restores from the snapshot captured in startPreview.
   * Used when user cancels interaction (e.g., Escape key).
   */
  cancelPreview: () => {
    const { previewState } = get();
    
    // Restore activeTools from the snapshot captured at preview start
    // This reverts any changes made by updateToolValue during the drag
    if (previewState.isDragging && previewState.originalActiveTools.length > 0) {
      set({
        activeTools: previewState.originalActiveTools.map(tool => ({ ...tool })),
        previewState: defaultPreviewState,
      });
    } else {
      // No active preview or empty snapshot, just clear preview state
      set({
        previewState: defaultPreviewState,
      });
    }
  },
  
  // History actions for undo/redo functionality
  
  /**
   * Undo the last action by reverting to the previous history entry.
   * Decrements pointer and restores activeTools from that entry.
   * No-op if at the beginning of history (pointer <= 0).
   * Requirements: 1.1, 1.2, 1.3
   */
  undo: () => {
    const { history } = get();
    if (history.pointer <= 0) return;
    
    const newPointer = history.pointer - 1;
    const entry = history.entries[newPointer];
    
    set({
      activeTools: entry.activeTools.map(tool => ({ ...tool })),
      history: {
        ...history,
        pointer: newPointer,
      },
    });
  },
  
  /**
   * Redo a previously undone action by restoring the next history entry.
   * Increments pointer and restores activeTools from that entry.
   * No-op if at the end of history (pointer >= entries.length - 1).
   * Requirements: 2.1, 2.2, 2.3
   */
  redo: () => {
    const { history } = get();
    if (history.pointer >= history.entries.length - 1) return;
    
    const newPointer = history.pointer + 1;
    const entry = history.entries[newPointer];
    
    set({
      activeTools: entry.activeTools.map(tool => ({ ...tool })),
      history: {
        ...history,
        pointer: newPointer,
      },
    });
  },
  
  /**
   * Check if undo is available.
   * Returns true if pointer > 0 (there are previous entries to undo to).
   * Requirements: 4.1, 4.2
   */
  canUndo: () => {
    const { history } = get();
    return history.pointer > 0;
  },
  
  /**
   * Check if redo is available.
   * Returns true if pointer < entries.length - 1 (there are future entries to redo to).
   * Requirements: 4.3, 4.4
   */
  canRedo: () => {
    const { history } = get();
    return history.pointer < history.entries.length - 1;
  },
  
  /**
   * Record current activeTools state to history.
   * Creates a new entry, truncates any future entries (after current pointer),
   * and respects maxSize by removing oldest entries if needed.
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  recordHistory: () => {
    const { activeTools, history } = get();
    const newEntry = createHistoryEntry(activeTools);
    
    // Truncate future entries (everything after current pointer)
    const truncatedEntries = history.entries.slice(0, history.pointer + 1);
    
    // Add new entry
    const newEntries = [...truncatedEntries, newEntry];
    
    // Respect maxSize by removing oldest entries
    const finalEntries = newEntries.length > history.maxSize
      ? newEntries.slice(newEntries.length - history.maxSize)
      : newEntries;
    
    set({
      history: {
        ...history,
        entries: finalEntries,
        pointer: finalEntries.length - 1,
      },
    });
  },
  
  /**
   * Clear all history and reset to initial state.
   * Records the current (empty) activeTools as the initial history entry
   * so that the first action can be undone back to this state.
   * Used when loading a new image.
   * Requirements: 5.1, 5.2
   */
  clearHistory: () => {
    const { activeTools } = get();
    const initialEntry = createHistoryEntry(activeTools);
    
    set({
      history: {
        ...DEFAULT_HISTORY_STATE,
        entries: [initialEntry],
        pointer: 0,
      },
    });
  },
}));
