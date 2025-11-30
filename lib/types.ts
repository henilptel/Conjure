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
 * Tool input from AI with optional initial value
 */
export interface ToolInput {
  name: string;
  initial_value?: number;
}

/**
 * Creates an ActiveTool from a tool name using TOOL_CONFIGS.
 * Returns null if the tool name is not valid.
 * 
 * @param toolName - The name of the tool to create
 * @param initialValue - Optional initial value to use instead of default
 * @returns ActiveTool with specified or default value, or null if invalid
 */
export function createToolConfig(toolName: string, initialValue?: number): ActiveTool | null {
  if (!isValidToolName(toolName)) {
    return null;
  }
  
  const config = TOOL_CONFIGS[toolName];
  // Use initialValue if provided, otherwise use defaultValue
  // Clamp to min/max range
  const value = initialValue !== undefined
    ? Math.max(config.min, Math.min(config.max, initialValue))
    : config.defaultValue;
    
  return {
    id: config.id,
    label: config.label,
    value,
    min: config.min,
    max: config.max,
  };
}

/**
 * Adds new tools to the active tools array.
 * Filters out duplicates (tools already present and within newToolNames) and invalid tool names.
 * Preserves existing tools and their current values.
 * 
 * @param currentTools - The current array of active tools
 * @param newToolNames - Array of tool names to add
 * @returns New array with existing tools preserved and new tools added
 * 
 * Requirements: 1.1, 1.3
 */
export function addTools(currentTools: ActiveTool[], newToolNames: string[]): ActiveTool[] {
  const existingIds = new Set(currentTools.map(t => t.id));
  
  // Deduplicate newToolNames and filter out already existing tools
  const uniqueNewNames = [...new Set(newToolNames)].filter(name => !existingIds.has(name));
  
  const newTools = uniqueNewNames
    .map(name => createToolConfig(name))    // Create tool configs
    .filter((tool): tool is ActiveTool => tool !== null); // Filter out invalid tools
  
  return [...currentTools, ...newTools];
}

/**
 * Adds new tools with initial values to the active tools array.
 * Filters out duplicates and invalid tool names.
 * If a tool already exists, updates its value to the new initial value.
 * 
 * @param currentTools - The current array of active tools
 * @param toolInputs - Array of tool inputs with names and optional initial values
 * @returns New array with tools added/updated
 * 
 * Requirements: 1.1, 1.3
 */
export function addToolsWithValues(currentTools: ActiveTool[], toolInputs: ToolInput[]): ActiveTool[] {
  const existingToolsMap = new Map(currentTools.map(t => [t.id, t]));
  const processedIds = new Set<string>();
  const result: ActiveTool[] = [];
  
  // Process new tool inputs
  for (const input of toolInputs) {
    if (processedIds.has(input.name)) continue;
    processedIds.add(input.name);
    
    const existingTool = existingToolsMap.get(input.name);
    if (existingTool) {
      // Update existing tool with new value if provided
      if (input.initial_value !== undefined) {
        const clampedValue = Math.max(existingTool.min, Math.min(existingTool.max, input.initial_value));
        result.push({ ...existingTool, value: clampedValue });
      } else {
        result.push(existingTool);
      }
      existingToolsMap.delete(input.name);
    } else {
      // Create new tool
      const newTool = createToolConfig(input.name, input.initial_value);
      if (newTool) {
        result.push(newTool);
      }
    }
  }
  
  // Add remaining existing tools that weren't in the input
  for (const tool of existingToolsMap.values()) {
    result.push(tool);
  }
  
  return result;
}


/**
 * Updates the value of a specific tool in the active tools array.
 * Clamps the value to the tool's min/max range.
 * Returns a new array with only the specified tool updated.
 * 
 * @param tools - The current array of active tools
 * @param toolId - The id of the tool to update
 * @param newValue - The new value to set
 * @returns New array with the specified tool's value updated
 * 
 * Requirements: 5.1
 */
export function updateToolValue(tools: ActiveTool[], toolId: string, newValue: number): ActiveTool[] {
  return tools.map(tool => {
    if (tool.id !== toolId) {
      return tool;
    }
    // Clamp value to tool's min/max range
    const clampedValue = Math.max(tool.min, Math.min(tool.max, newValue));
    return { ...tool, value: clampedValue };
  });
}


/**
 * Removes a tool from the active tools array.
 * Returns a new array without the specified tool.
 * If the tool id doesn't exist, returns the original array unchanged.
 * 
 * @param tools - The current array of active tools
 * @param toolId - The id of the tool to remove
 * @returns New array without the specified tool
 * 
 * Requirements: 4.2
 */
export function removeTool(tools: ActiveTool[], toolId: string): ActiveTool[] {
  return tools.filter(tool => tool.id !== toolId);
}
