/**
 * Tool Registry for MagickFlow Image Editor
 * 
 * Centralized configuration for all image processing tools following the Open-Closed Principle.
 * Adding new tools requires only adding an entry to TOOL_REGISTRY without modifying
 * the processing pipeline.
 * 
 * Requirements: 2.1, 2.2
 */

import type { IMagickImage } from '@imagemagick/magick-wasm';
import { EFFECT_ORDER, TOOL_EXECUTORS } from './tools-definitions';

/**
 * Definition for a single tool in the registry.
 * Each tool has metadata (id, label, min, max, defaultValue) and an execute function
 * that applies the effect to an IMagickImage in-place.
 */
export interface ToolDefinition {
  /** Unique identifier for the tool */
  id: string;
  /** Display label shown in the UI */
  label: string;
  /** Minimum allowed value */
  min: number;
  /** Maximum allowed value */
  max: number;
  /** Default value when tool is first added */
  defaultValue: number;
  /** 
   * Execute function that applies the effect to an image in-place.
   * @param image - The IMagickImage to modify
   * @param value - The effect intensity/value
   */
  execute: (image: IMagickImage, value: number) => void;
}

/**
 * Effect application order for consistent results.
 * Effects are applied in this order: geometry → color adjustments → detail filters → artistic effects
 * 
 * Order: rotate → brightness → saturation → hue → invert → blur → sharpen → charcoal → 
 *        edge_detect → grayscale → sepia → contrast → solarize → vignette → wave
 * 
 * Requirements: 5.1, 5.2
 */
export { EFFECT_ORDER };

/**
 * Centralized tool registry mapping tool IDs to their configurations and execute functions.
 * 
 * Requirements: 2.1, 2.2
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  blur: {
    id: 'blur',
    label: 'Blur',
    min: 0,
    max: 20,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.blur,
  },

  grayscale: {
    id: 'grayscale',
    label: 'Grayscale',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.grayscale,
  },

  sepia: {
    id: 'sepia',
    label: 'Sepia',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.sepia,
  },

  contrast: {
    id: 'contrast',
    label: 'Contrast',
    min: -100,
    max: 100,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.contrast,
  },

  // Category A: Color & Light Tools
  brightness: {
    id: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 200,
    defaultValue: 100,
    execute: TOOL_EXECUTORS.brightness,
  },

  saturation: {
    id: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 300,
    defaultValue: 100,
    execute: TOOL_EXECUTORS.saturation,
  },

  hue: {
    id: 'hue',
    label: 'Hue',
    min: 0,
    max: 200,
    defaultValue: 100,
    execute: TOOL_EXECUTORS.hue,
  },

  invert: {
    id: 'invert',
    label: 'Invert',
    min: 0,
    max: 1,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.invert,
  },

  // Category B: Detail & Texture Tools
  sharpen: {
    id: 'sharpen',
    label: 'Sharpen',
    min: 0,
    max: 10,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.sharpen,
  },

  charcoal: {
    id: 'charcoal',
    label: 'Charcoal',
    min: 0,
    max: 10,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.charcoal,
  },

  edge_detect: {
    id: 'edge_detect',
    label: 'Edge Detect',
    min: 0,
    max: 10,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.edge_detect,
  },

  // Category C: Geometry & Distortion Tools
  rotate: {
    id: 'rotate',
    label: 'Rotate',
    min: -180,
    max: 180,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.rotate,
  },

  wave: {
    id: 'wave',
    label: 'Wave',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.wave,
  },

  // Category D: Artistic Tools
  solarize: {
    id: 'solarize',
    label: 'Solarize',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.solarize,
  },

  vignette: {
    id: 'vignette',
    label: 'Vignette',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: TOOL_EXECUTORS.vignette,
  },
};

/**
 * Gets the tool configuration for a given tool ID.
 * Returns undefined if the tool is not found in the registry.
 * Uses Object.hasOwn to avoid prototype chain issues with keys like 'constructor' or '__proto__'.
 * 
 * @param toolId - The ID of the tool to look up
 * @returns The ToolDefinition or undefined if not found
 */
export function getToolConfig(toolId: string): ToolDefinition | undefined {
  if (!Object.hasOwn(TOOL_REGISTRY, toolId)) {
    return undefined;
  }
  return TOOL_REGISTRY[toolId];
}

/**
 * Gets all tool IDs from the registry.
 * 
 * @returns Array of all registered tool IDs
 */
export function getAllToolIds(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * Checks if a tool ID exists in the registry.
 * Uses Object.hasOwn to avoid prototype chain issues.
 * 
 * @param toolId - The ID to check
 * @returns true if the tool exists in the registry
 */
export function isRegisteredTool(toolId: string): boolean {
  return Object.hasOwn(TOOL_REGISTRY, toolId);
}

/**
 * Gets all tool definitions from the registry.
 * 
 * @returns Array of all ToolDefinition objects
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY);
}
