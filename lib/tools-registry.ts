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
import { Percentage } from '@imagemagick/magick-wasm';

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
 * Effects are always applied in this order: blur → grayscale → sepia → contrast
 * 
 * Requirements: 2.4
 */
export const EFFECT_ORDER: readonly string[] = ['blur', 'grayscale', 'sepia', 'contrast'];

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
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        // blur(0, sigma) lets ImageMagick auto-calculate kernel size from sigma
        image.blur(0, value);
      }
    },
  },

  grayscale: {
    id: 'grayscale',
    label: 'Grayscale',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      if (value <= 0) {
        return;
      }
      
      if (value >= 100) {
        // Full grayscale conversion
        image.grayscale();
      } else {
        // Partial grayscale using modulate (reduce saturation)
        // modulate takes Percentage objects for brightness, saturation, hue
        const saturation = new Percentage(100 - value);
        image.modulate(new Percentage(100), saturation, new Percentage(100));
      }
    },
  },

  sepia: {
    id: 'sepia',
    label: 'Sepia',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        // SepiaTone takes a Percentage threshold
        image.sepiaTone(new Percentage(value));
      }
    },
  },

  contrast: {
    id: 'contrast',
    label: 'Contrast',
    min: -100,
    max: 100,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      if (value === 0) {
        return;
      }
      
      // Use brightnessContrast which directly accepts percentage values
      // brightness = 0 (no change), contrast = value (-100 to 100)
      // This properly handles both positive (increase) and negative (decrease) values
      image.brightnessContrast(new Percentage(0), new Percentage(value));
    },
  },
};

/**
 * Gets the tool configuration for a given tool ID.
 * Returns undefined if the tool is not found in the registry.
 * 
 * @param toolId - The ID of the tool to look up
 * @returns The ToolDefinition or undefined if not found
 */
export function getToolConfig(toolId: string): ToolDefinition | undefined {
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
 * 
 * @param toolId - The ID to check
 * @returns true if the tool exists in the registry
 */
export function isRegisteredTool(toolId: string): boolean {
  return toolId in TOOL_REGISTRY;
}

/**
 * Gets all tool definitions from the registry.
 * 
 * @returns Array of all ToolDefinition objects
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY);
}
