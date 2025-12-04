/**
 * Shared definitions for MagickFlow Image Editor tools.
 * 
 * This file contains the shared logic and constants used by both the main thread (tools-registry.ts)
 * and the worker thread (magick.worker.ts) to ensure consistency and eliminate duplication.
 */

import type { IMagickImage } from '@imagemagick/magick-wasm';
import { Percentage, PixelInterpolateMethod } from '@imagemagick/magick-wasm';

/**
 * Function signature for executing a tool's effect on an image.
 */
export type ToolExecutor = (image: IMagickImage, value: number) => void;

/**
 * Effect application order for consistent results.
 * Effects are applied in this order: geometry → color adjustments → detail filters → artistic effects
 * 
 * Order: rotate → brightness → saturation → hue → invert → blur → sharpen → charcoal → 
 *        edge_detect → grayscale → sepia → contrast → solarize → vignette → wave
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
  'wave',
];

/**
 * Map of tool IDs to their execution logic.
 */
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  blur: (image: IMagickImage, value: number): void => {
    if (value > 0) {
      // blur(0, sigma) lets ImageMagick auto-calculate kernel size from sigma
      image.blur(0, value);
    }
  },

  grayscale: (image: IMagickImage, value: number): void => {
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

  sepia: (image: IMagickImage, value: number): void => {
    if (value > 0) {
      // SepiaTone takes a Percentage threshold
      image.sepiaTone(new Percentage(value));
    }
  },

  contrast: (image: IMagickImage, value: number): void => {
    if (value === 0) {
      return;
    }
    
    // Use brightnessContrast which directly accepts percentage values
    // brightness = 0 (no change), contrast = value (-100 to 100)
    // This properly handles both positive (increase) and negative (decrease) values
    image.brightnessContrast(new Percentage(0), new Percentage(value));
  },

  brightness: (image: IMagickImage, value: number): void => {
    // modulate(brightness, saturation, hue) - 100 is neutral
    // No conditional needed since modulate(100, 100, 100) is neutral
    image.modulate(new Percentage(value), new Percentage(100), new Percentage(100));
  },

  saturation: (image: IMagickImage, value: number): void => {
    // modulate(brightness, saturation, hue) - 100 is neutral
    image.modulate(new Percentage(100), new Percentage(value), new Percentage(100));
  },

  hue: (image: IMagickImage, value: number): void => {
    // modulate(brightness, saturation, hue) - 100 is neutral
    image.modulate(new Percentage(100), new Percentage(100), new Percentage(value));
  },

  invert: (image: IMagickImage, value: number): void => {
    // Toggle behavior: only apply negate when value > 0
    if (value > 0) {
      // negate() inverts all pixel colors
      image.negate();
    }
  },

  sharpen: (image: IMagickImage, value: number): void => {
    // Only apply when value > 0
    if (value > 0) {
      // sharpen(radius, sigma) - radius 0 lets ImageMagick auto-calculate
      image.sharpen(0, value);
    }
  },

  charcoal: (image: IMagickImage, value: number): void => {
    // Only apply when value > 0
    if (value > 0) {
      // charcoal(radius, sigma) - radius 0 lets ImageMagick auto-calculate
      image.charcoal(0, value);
    }
  },

  edge_detect: (image: IMagickImage, value: number): void => {
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

  rotate: (image: IMagickImage, value: number): void => {
    // Only apply when value !== 0
    // Note: ImageEngine already returns actual dimensions after processing
    if (value !== 0) {
      image.rotate(value);
    }
  },

  wave: (image: IMagickImage, value: number): void => {
    // Only apply when value > 0
    if (value > 0) {
      // wave(interpolate, amplitude, length) creates a wave distortion
      // Scale value 0-100 to amplitude 0-25 for visible but not extreme effect
      const amplitude = (value / 100) * 25;
      const wavelength = 150;
      (image as unknown as { wave: (interpolate: PixelInterpolateMethod, amplitude: number, length: number) => void })
        .wave(PixelInterpolateMethod.Average, amplitude, wavelength);
    }
  },

  solarize: (image: IMagickImage, value: number): void => {
    // Only apply when value > 0
    if (value > 0) {
      image.solarize(new Percentage(value));
    }
  },

  vignette: (image: IMagickImage, value: number): void => {
    // Only apply when value > 0
    if (value > 0) {
      image.vignette(0, value, 0, 0);
    }
  },
};
