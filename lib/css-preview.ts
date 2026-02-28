/**
 * CSS Filter Preview Utilities
 * 
 * Maps ImageMagick WASM effects to approximate CSS filter equivalents for
 * instant visual feedback during slider interactions. CSS filters are applied
 * directly to the canvas element, avoiding expensive WASM re-decoding.
 * 
 * Accuracy Notes:
 * - CSS filters are approximations and won't match WASM output exactly
 * - Some effects (charcoal, edge_detect, wave, vignette) have no CSS equivalent
 * - Users see the fast preview during drag, then accurate WASM result on release
 */

import type { ActiveTool } from './types';

/**
 * CSS filter string for canvas preview
 */
export interface CSSPreviewResult {
  /** CSS filter string to apply to canvas element */
  filter: string;
  /** CSS transform string (for rotation) */
  transform: string;
  /** Whether any effects were mapped to CSS (false = show original) */
  hasEffects: boolean;
  /** List of tool IDs that couldn't be approximated with CSS */
  unsupportedTools: string[];
}

/**
 * Maps a single tool to its CSS filter equivalent.
 * Returns null if the tool has no CSS equivalent.
 */
function mapToolToCSSFilter(tool: ActiveTool): string | null {
  switch (tool.id) {
    case 'blur':
      // CSS blur uses pixels, ImageMagick uses sigma
      // Approximate: CSS blur(Xpx) ≈ ImageMagick blur sigma X
      if (tool.value <= 0) return null;
      return `blur(${tool.value}px)`;

    case 'brightness':
      // ImageMagick brightness: 100 = normal, 0 = black, 200 = 2x bright
      // CSS brightness: 1 = normal, 0 = black, 2 = 2x bright
      // Map: CSS = ImageMagick / 100
      if (tool.value === 100) return null;
      return `brightness(${tool.value / 100})`;

    case 'contrast':
      // ImageMagick contrast: -100 to 100, 0 = normal
      // CSS contrast: 0 = gray, 1 = normal, 2 = 2x contrast
      // Map: CSS = 1 + (ImageMagick / 100)
      if (tool.value === 0) return null;
      const contrastValue = 1 + (tool.value / 100);
      return `contrast(${Math.max(0, contrastValue)})`;

    case 'saturation':
      // ImageMagick saturation: 100 = normal, 0 = grayscale, 300 = 3x saturated
      // CSS saturate: 1 = normal, 0 = grayscale, 3 = 3x saturated
      // Map: CSS = ImageMagick / 100
      if (tool.value === 100) return null;
      return `saturate(${tool.value / 100})`;

    case 'grayscale':
      // ImageMagick grayscale: 0 = color, 100 = full grayscale
      // CSS grayscale: 0 = color, 1 = full grayscale
      // Map: CSS = ImageMagick / 100
      if (tool.value <= 0) return null;
      return `grayscale(${tool.value / 100})`;

    case 'sepia':
      // ImageMagick sepia: 0 = none, 100 = full sepia
      // CSS sepia: 0 = none, 1 = full sepia
      // Map: CSS = ImageMagick / 100
      if (tool.value <= 0) return null;
      return `sepia(${tool.value / 100})`;

    case 'invert':
      // ImageMagick invert: 0 = off, 1 = on (toggle)
      // CSS invert: 0 = none, 1 = full invert
      if (tool.value <= 0) return null;
      return 'invert(1)';

    case 'hue':
      // ImageMagick hue (via modulate): 100 = normal, 0 = -180°, 200 = +180°
      // CSS hue-rotate: 0deg = normal
      // Map: CSS = (ImageMagick - 100) * 1.8 degrees
      if (tool.value === 100) return null;
      const hueDegrees = (tool.value - 100) * 1.8;
      return `hue-rotate(${hueDegrees}deg)`;

    // Effects with no good CSS equivalent - return null
    case 'sharpen':
    case 'charcoal':
    case 'edge_detect':
    case 'solarize':
    case 'vignette':
    case 'wave':
      // These have no CSS filter equivalent
      // Could potentially use SVG filters for some, but keeping it simple
      return null;

    case 'rotate':
      // Handled separately via transform, not filter
      return null;

    default:
      return null;
  }
}

/**
 * Maps rotation tool to CSS transform.
 */
function mapRotationToTransform(tools: ActiveTool[]): string {
  const rotateTool = tools.find(t => t.id === 'rotate');
  if (!rotateTool || rotateTool.value === 0) {
    return '';
  }
  return `rotate(${rotateTool.value}deg)`;
}

/**
 * Converts an array of active tools to CSS filter and transform strings.
 * 
 * @param tools - Array of ActiveTool objects
 * @returns CSSPreviewResult with filter string, transform string, and metadata
 * 
 * Usage:
 * ```tsx
 * const { filter, transform } = mapToolsToCSSPreview(activeTools);
 * <canvas style={{ filter, transform }} />
 * ```
 */
export function mapToolsToCSSPreview(tools: ActiveTool[]): CSSPreviewResult {
  if (tools.length === 0) {
    return {
      filter: 'none',
      transform: '',
      hasEffects: false,
      unsupportedTools: [],
    };
  }

  const filters: string[] = [];
  const unsupportedTools: string[] = [];

  for (const tool of tools) {
    if (tool.id === 'rotate') {
      // Handled separately
      continue;
    }

    const cssFilter = mapToolToCSSFilter(tool);
    if (cssFilter) {
      filters.push(cssFilter);
    } else if (isNonNeutralValue(tool)) {
      // Tool has a non-default value but no CSS equivalent
      unsupportedTools.push(tool.id);
    }
  }

  const transform = mapRotationToTransform(tools);

  return {
    filter: filters.length > 0 ? filters.join(' ') : 'none',
    transform,
    hasEffects: filters.length > 0 || transform !== '',
    unsupportedTools,
  };
}

/**
 * Checks if a tool has a non-neutral (non-default) value that would
 * result in a visible effect.
 */
function isNonNeutralValue(tool: ActiveTool): boolean {
  switch (tool.id) {
    case 'blur':
    case 'sharpen':
    case 'charcoal':
    case 'edge_detect':
    case 'sepia':
    case 'grayscale':
    case 'solarize':
    case 'vignette':
    case 'wave':
    case 'invert':
      return tool.value > 0;

    case 'brightness':
    case 'saturation':
    case 'hue':
      return tool.value !== 100;

    case 'contrast':
    case 'rotate':
      return tool.value !== 0;

    default:
      return false;
  }
}

/**
 * Checks if the current tools include any effects that cannot be
 * accurately previewed with CSS filters.
 * 
 * @param tools - Array of ActiveTool objects
 * @returns true if any active tools have no CSS equivalent
 */
export function hasUnsupportedEffects(tools: ActiveTool[]): boolean {
  const { unsupportedTools } = mapToolsToCSSPreview(tools);
  return unsupportedTools.length > 0;
}

/**
 * Returns a list of tool IDs that are currently active but have no
 * CSS filter equivalent for preview.
 * 
 * @param tools - Array of ActiveTool objects
 * @returns Array of tool IDs without CSS equivalents
 */
export function getUnsupportedToolIds(tools: ActiveTool[]): string[] {
  const { unsupportedTools } = mapToolsToCSSPreview(tools);
  return unsupportedTools;
}

/**
 * CSS filter support matrix for reference.
 * Maps tool IDs to their CSS filter support status.
 */
export const CSS_FILTER_SUPPORT: Record<string, 'full' | 'approximate' | 'none'> = {
  blur: 'approximate',      // CSS blur is similar but not identical
  brightness: 'full',       // Direct mapping
  contrast: 'approximate',  // Different algorithm but similar result
  saturation: 'full',       // Direct mapping via saturate()
  grayscale: 'full',        // Direct mapping
  sepia: 'full',            // Direct mapping
  invert: 'full',           // Direct mapping
  hue: 'approximate',       // hue-rotate is similar but not identical
  rotate: 'full',           // CSS transform
  sharpen: 'none',          // No CSS equivalent
  charcoal: 'none',         // No CSS equivalent
  edge_detect: 'none',      // Could use SVG filter, but complex
  solarize: 'none',         // No CSS equivalent
  vignette: 'none',         // Could use radial-gradient overlay
  wave: 'none',             // No CSS equivalent
};
