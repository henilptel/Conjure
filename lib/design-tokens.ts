/**
 * VisionOS-style Glassmorphism Design Tokens
 * 
 * Centralized design system for consistent styling across components.
 * Based on Apple's VisionOS glass aesthetic with light edge effects.
 */

// =============================================================================
// Glass Surface Styles
// =============================================================================

/**
 * Base glass surface - use for panels, cards, modals
 */
export const glass = {
  background: 'bg-zinc-900/70',
  blur: 'backdrop-blur-2xl backdrop-saturate-150',
  border: 'border border-white/20',
  /** Inline style for light edge effect */
  boxShadow: `
    inset 0 1px 0 0 rgba(255,255,255,0.1),
    0 8px 32px rgba(0,0,0,0.3)
  `,
} as const;

/**
 * Subtle glass - use for buttons, small interactive elements
 */
export const glassSubtle = {
  background: 'bg-zinc-900/70',
  blur: 'backdrop-blur-2xl backdrop-saturate-150',
  border: 'border border-white/20',
  boxShadow: `
    inset 0 1px 0 0 rgba(255,255,255,0.1),
    0 4px 16px rgba(0,0,0,0.25)
  `,
} as const;

/**
 * Interactive glass - for cards that can be selected/active
 */
export const glassInteractive = {
  base: 'bg-white/5 border border-white/[0.08]',
  hover: 'hover:border-white/15 hover:bg-white/[0.08]',
  active: 'bg-white/10 border border-white/25',
  activeBoxShadow: `
    inset 0 1px 0 0 rgba(255,255,255,0.1),
    0 2px 8px rgba(0,0,0,0.15)
  `,
} as const;

// =============================================================================
// Combined Class Strings (for convenience)
// =============================================================================

/** Full glass surface classes */
export const glassSurface = `${glass.background} ${glass.blur} ${glass.border}`;

/** Subtle glass classes */
export const glassButton = `${glassSubtle.background} ${glassSubtle.blur} ${glassSubtle.border}`;

/** Interactive card - default state */
export const glassCardBase = `${glassInteractive.base} ${glassInteractive.hover}`;

/** Interactive card - active state */
export const glassCardActive = glassInteractive.active;

// =============================================================================
// Animation Easings
// =============================================================================

export const easing = {
  /** Standard ease for most animations */
  standard: [0.4, 0, 0.2, 1] as const,
  /** Ease out for enter animations */
  out: [0, 0, 0.2, 1] as const,
  /** Ease in for exit animations */
  in: [0.4, 0, 1, 1] as const,
} as const;

// =============================================================================
// Common Transitions
// =============================================================================

export const transitions = {
  /** Slide panel from right */
  slideRight: {
    type: 'tween' as const,
    duration: 0.3,
    ease: easing.standard,
  },
  /** Fade in/out */
  fade: {
    duration: 0.2,
  },
  /** Scale + fade for modals/popovers */
  pop: {
    duration: 0.2,
    ease: easing.out,
  },
} as const;

// =============================================================================
// Text Colors
// =============================================================================

export const text = {
  primary: 'text-white',
  secondary: 'text-zinc-300',
  muted: 'text-zinc-400',
  subtle: 'text-zinc-500',
  disabled: 'text-zinc-600',
} as const;

// =============================================================================
// Icon Sizes (consistent with Lucide)
// =============================================================================

export const iconSize = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
} as const;
