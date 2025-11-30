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
import { Percentage, PixelInterpolateMethod } from '@imagemagick/magick-wasm';

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
 *        edge_detect → grayscale → sepia → contrast → solarize → vignette → implode
 * 
 * Requirements: 5.1, 5.2
 */
export const EFFECT_ORDER: readonly string[] = [
  // Geometry (applied first - changes canvas)
  'rotate',
  // Color adjustments
  'brightness',
  'saturation',
  'hue',
  'invert',
  // Detail filters
  'blur',
  'sharpen',
  'charcoal',
  'edge_detect',
  'grayscale',
  // Artistic effects (applied last)
  'sepia',
  'contrast',
  'solarize',
  'vignette',
  'implode',
];

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

  // Category A: Color & Light Tools
  brightness: {
    id: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 200,
    defaultValue: 100,
    execute: (image: IMagickImage, value: number): void => {
      // modulate(brightness, saturation, hue) - 100 is neutral
      // No conditional needed since modulate(100, 100, 100) is neutral
      image.modulate(new Percentage(value), new Percentage(100), new Percentage(100));
    },
  },

  saturation: {
    id: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 300,
    defaultValue: 100,
    execute: (image: IMagickImage, value: number): void => {
      // modulate(brightness, saturation, hue) - 100 is neutral
      image.modulate(new Percentage(100), new Percentage(value), new Percentage(100));
    },
  },

  hue: {
    id: 'hue',
    label: 'Hue',
    min: 0,
    max: 200,
    defaultValue: 100,
    execute: (image: IMagickImage, value: number): void => {
      // modulate(brightness, saturation, hue) - 100 is neutral
      image.modulate(new Percentage(100), new Percentage(100), new Percentage(value));
    },
  },

  invert: {
    id: 'invert',
    label: 'Invert',
    min: 0,
    max: 1,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Toggle behavior: only apply negate when value > 0
      if (value > 0) {
        // negate() inverts all pixel colors
        image.negate();
      }
    },
  },

  // Category B: Detail & Texture Tools
  sharpen: {
    id: 'sharpen',
    label: 'Sharpen',
    min: 0,
    max: 10,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Only apply when value > 0
      if (value > 0) {
        // sharpen(radius, sigma) - radius 0 lets ImageMagick auto-calculate
        image.sharpen(0, value);
      }
    },
  },

  charcoal: {
    id: 'charcoal',
    label: 'Charcoal',
    min: 0,
    max: 10,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Only apply when value > 0
      if (value > 0) {
        // charcoal(radius, sigma) - radius 0 lets ImageMagick auto-calculate
        image.charcoal(0, value);
      }
    },
  },

  edge_detect: {
    id: 'edge_detect',
    label: 'Edge Detect',
    min: 0,
    max: 10,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Only apply when value > 0
      if (value > 0) {
        // cannyEdge(radius, sigma, lowerPercent, upperPercent)
        // radius: 0 lets ImageMagick auto-calculate
        // sigma: controls blur before edge detection (value maps 1-10 to sigma)
        // lowerPercent/upperPercent: thresholds for edge detection (10%, 30% are good defaults)
        const sigma = value;
        (image as unknown as { cannyEdge: (radius: number, sigma: number, lower: Percentage, upper: Percentage) => void })
          .cannyEdge(0, sigma, new Percentage(10), new Percentage(30));
      }
    },
  },

  // Category C: Geometry & Distortion Tools
  rotate: {
    id: 'rotate',
    label: 'Rotate',
    min: -180,
    max: 180,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Only apply when value !== 0
      // Note: ImageEngine already returns actual dimensions after processing
      if (value !== 0) {
        image.rotate(value);
      }
    },
  },

  implode: {
    id: 'implode',
    label: 'Implode',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Only apply when value > 0
      if (value > 0) {
        // Use wave effect as implode is not available in magick-wasm
        // wave(interpolate, amplitude, length) creates a wave distortion
        // Scale value 0-100 to amplitude 0-25 for visible but not extreme effect
        const amplitude = (value / 100) * 25;
        const wavelength = 150;
        (image as unknown as { wave: (interpolate: PixelInterpolateMethod, amplitude: number, length: number) => void })
          .wave(PixelInterpolateMethod.Average, amplitude, wavelength);
      }
    },
  },

  // Category D: Artistic Tools
  solarize: {
    id: 'solarize',
    label: 'Solarize',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Only apply when value > 0
      if (value > 0) {
        image.solarize(new Percentage(value));
      }
    },
  },

  vignette: {
    id: 'vignette',
    label: 'Vignette',
    min: 0,
    max: 100,
    defaultValue: 0,
    execute: (image: IMagickImage, value: number): void => {
      // Only apply when value > 0
      if (value > 0) {
        image.vignette(0, value, 0, 0);
      }
    },
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
