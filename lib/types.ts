/**
 * Shared types for the MagickFlow image editor
 */

/**
 * Represents a single tool control in the HUD panel.
 * Each tool has a unique identifier, display label, current value,
 * and min/max constraints for the slider.
 */
export interface ActiveTool {
  /** Unique identifier: 'blur', 'grayscale', 'sepia', 'contrast' */
  id: string;
  /** Display label shown in the UI */
  label: string;
  /** Current slider value */
  value: number;
  /** Minimum allowed value */
  min: number;
  /** Maximum allowed value */
  max: number;
}

/**
 * Configuration type for tool definitions including default value
 */
export type ToolConfig = Omit<ActiveTool, 'value'> & { defaultValue: number };

/**
 * Valid tool names that can be used with the HUD panel
 */
export type ToolName = 'blur' | 'grayscale' | 'sepia' | 'contrast';

/**
 * Default configurations for all available tools.
 * Each tool has id, label, min, max, and defaultValue.
 */
export const TOOL_CONFIGS: Record<ToolName, ToolConfig> = {
  blur: { id: 'blur', label: 'Blur', min: 0, max: 20, defaultValue: 0 },
  grayscale: { id: 'grayscale', label: 'Grayscale', min: 0, max: 100, defaultValue: 0 },
  sepia: { id: 'sepia', label: 'Sepia', min: 0, max: 100, defaultValue: 0 },
  contrast: { id: 'contrast', label: 'Contrast', min: -100, max: 100, defaultValue: 0 },
};

/**
 * Represents the current state of the image being processed.
 * This state is shared between ImageProcessor and ChatInterface
 * to enable context-aware AI responses.
 */
export interface ImageState {
  /** Whether an image is currently loaded */
  hasImage: boolean;
  /** Width of the loaded image in pixels, null if no image */
  width: number | null;
  /** Height of the loaded image in pixels, null if no image */
  height: number | null;
  /** Current blur level (0 = no blur) */
  blur: number;
  /** Whether grayscale conversion has been applied */
  isGrayscale: boolean;
  /** Active tools currently displayed in the HUD panel */
  activeTools: ActiveTool[];
}

/**
 * Default state when no image is loaded
 */
export const defaultImageState: ImageState = {
  hasImage: false,
  width: null,
  height: null,
  blur: 0,
  isGrayscale: false,
  activeTools: [],
};

/**
 * Checks if a string is a valid tool name
 */
export function isValidToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_CONFIGS, name);
}

/**
 * Creates an ActiveTool from a tool name using TOOL_CONFIGS.
 * Returns null if the tool name is not valid.
 * 
 * @param toolName - The name of the tool to create
 * @returns ActiveTool with default value, or null if invalid
 */
export function createToolConfig(toolName: string): ActiveTool | null {
  if (!isValidToolName(toolName)) {
    return null;
  }
  
  const config = TOOL_CONFIGS[toolName];
  return {
    id: config.id,
    label: config.label,
    value: config.defaultValue,
    min: config.min,
    max: config.max,
  };
}
