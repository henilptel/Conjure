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
 * Application state interface
 */
export interface AppState {
  // State
  activeTools: ActiveTool[];
  imageState: ImageStateData;
  processingStatus: ProcessingStatus;
  isCompareMode: boolean;
  
  // Actions
  addTool: (toolInputs: ToolInput[]) => void;
  removeTool: (toolId: string) => void;
  updateToolValue: (toolId: string, value: number) => void;
  setImageState: (state: Partial<ImageStateData>) => void;
  setProcessingStatus: (status: ProcessingStatus) => void;
  setCompareMode: (enabled: boolean) => void;
  resetTools: () => void;
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
 * Zustand store for application state
 * Provides centralized state management for activeTools, imageState, and processingStatus
 */
export const useAppStore = create<AppState>((set) => ({
  // Initial state
  activeTools: [],
  imageState: defaultImageState,
  processingStatus: 'idle',
  isCompareMode: false,
  
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
    set({ activeTools: [] });
  },
}));
