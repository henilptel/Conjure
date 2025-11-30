import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for conditional class merging.
 * Combines clsx for conditional classes with tailwind-merge
 * to properly handle Tailwind CSS class conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Glassmorphism style configuration
 * Requirements: 4.1, 5.1
 */
export interface GlassmorphismStyle {
  backdrop: string;      // "backdrop-blur-md"
  background: string;    // "bg-black/40"
  border: string;        // "border border-white/10"
  radius: string;        // "rounded-2xl"
}

/**
 * Default glassmorphism style constants
 * Requirements: 4.1, 5.1
 */
export const GLASS_STYLE: GlassmorphismStyle = {
  backdrop: 'backdrop-blur-md',
  background: 'bg-black/40',
  border: 'border border-white/10',
  radius: 'rounded-2xl',
};

/**
 * Composes glassmorphism classes from a style configuration.
 * Returns a string containing all required glassmorphism properties.
 * 
 * Requirements: 4.1, 5.1
 */
export function composeGlassmorphismClasses(style: GlassmorphismStyle = GLASS_STYLE): string {
  return cn(style.backdrop, style.background, style.border, style.radius);
}

/**
 * Validates that a class string contains all required glassmorphism properties.
 * Returns true if all required properties are present.
 * 
 * Required properties:
 * - backdrop-blur (any blur level)
 * - semi-transparent background (bg-{color}/{opacity})
 * - border with transparency (border-{color}/{opacity})
 * - border-radius (rounded-{size})
 * 
 * Requirements: 4.1, 5.1
 */
export function validateGlassmorphismClasses(classString: string): {
  valid: boolean;
  hasBackdropBlur: boolean;
  hasTransparentBackground: boolean;
  hasBorderWithTransparency: boolean;
  hasBorderRadius: boolean;
} {
  const hasBackdropBlur = /backdrop-blur(-[\w-]+)?/.test(classString);
  const hasTransparentBackground = /bg-[\w-]+\/\d+/.test(classString);
  const hasBorderWithTransparency = /\bborder\b/.test(classString) && /border-[\w-]+\/\d+/.test(classString);
  const hasBorderRadius = /rounded(-[\w-]+)?/.test(classString);
  
  return {
    valid: hasBackdropBlur && hasTransparentBackground && hasBorderWithTransparency && hasBorderRadius,
    hasBackdropBlur,
    hasTransparentBackground,
    hasBorderWithTransparency,
    hasBorderRadius,
  };
}
