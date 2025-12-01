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
  updateToolValue as updateToolValueInArray 
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
  
  // Preview state for CSS filter optimization
  previewState: PreviewState;
  
  // Actions
  addTool: (toolInputs: ToolInput[]) => void;
  removeTool: (toolId: string) => void;
  updateToolValue: (toolId: string, value: number) => void;
  setImageState: (state: Partial<ImageStateData>) => void;
  setProcessingStatus: (status: ProcessingStatus) => void;
  setCompareMode: (enabled: boolean) => void;
  resetTools: () => void;
  
  // Preview actions for CSS filter optimization
  startPreview: (toolId: string) => void;
  updatePreviewValue: (toolId: string, value: number) => void;
  commitPreview: () => void;
  cancelPreview: () => void;
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
};

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
  previewState: defaultPreviewState,
  
  // Actions
  
  /**
   * Add tools to activeTools array
   * Uses existing addToolsWithValues logic for deduplication and validation
   * Requirements: 1.2
   */
  addTool: (toolInputs: ToolInput[]) => {
    set((state) => ({
      activeTools: addToolsWithValues(state.activeTools, toolInputs),
    }));
  },
  
  /**
   * Remove a tool from activeTools by id
   * Uses existing removeTool logic
   * Requirements: 1.3
   */
  removeTool: (toolId: string) => {
    set((state) => ({
      activeTools: removeToolFromArray(state.activeTools, toolId),
    }));
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
   * Reset tools to empty array
   */
  resetTools: () => {
    set({ activeTools: [], previewState: defaultPreviewState });
  },
  
  // Preview actions for CSS filter optimization
  
  /**
   * Start preview mode when user begins dragging a slider.
   * Copies current activeTools to previewTools for CSS-based preview.
   */
  startPreview: (toolId: string) => {
    const { activeTools } = get();
    set({
      previewState: {
        isDragging: true,
        draggingToolId: toolId,
        previewTools: [...activeTools],
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
   */
  commitPreview: () => {
    const { previewState } = get();
    if (!previewState.isDragging) return;
    
    set({
      activeTools: [...previewState.previewTools],
      previewState: defaultPreviewState,
    });
  },
  
  /**
   * Cancel preview and revert to original activeTools.
   * Used when user cancels interaction (e.g., Escape key).
   */
  cancelPreview: () => {
    set({
      previewState: defaultPreviewState,
    });
  },
}));
