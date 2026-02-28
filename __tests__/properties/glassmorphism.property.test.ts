/**
 * Property-based tests for Glassmorphism Style Composition
 * **Feature: ui-redesign-v07**
 */

import * as fc from 'fast-check';
import {
  GlassmorphismStyle,
  GLASS_STYLE,
  composeGlassmorphismClasses,
  validateGlassmorphismClasses,
} from '@/lib/utils';

/**
 * Arbitrary for generating valid backdrop blur values
 */
const backdropBlurArb = fc.constantFrom(
  'backdrop-blur-none',
  'backdrop-blur-sm',
  'backdrop-blur',
  'backdrop-blur-md',
  'backdrop-blur-lg',
  'backdrop-blur-xl',
  'backdrop-blur-2xl',
  'backdrop-blur-3xl'
);

/**
 * Arbitrary for generating valid semi-transparent backgrounds
 */
const transparentBackgroundArb = fc.tuple(
  fc.constantFrom('black', 'white', 'zinc', 'gray', 'slate'),
  fc.integer({ min: 10, max: 90 })
).map(([color, opacity]) => `bg-${color}/${opacity}`);

/**
 * Arbitrary for generating valid border with transparency
 */
const borderWithTransparencyArb = fc.tuple(
  fc.constantFrom('white', 'black', 'zinc', 'gray'),
  fc.integer({ min: 5, max: 50 })
).map(([color, opacity]) => `border border-${color}/${opacity}`);

/**
 * Arbitrary for generating valid border radius
 */
const borderRadiusArb = fc.constantFrom(
  'rounded',
  'rounded-sm',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'rounded-2xl',
  'rounded-3xl',
  'rounded-full'
);

/**
 * Arbitrary for generating valid GlassmorphismStyle objects
 */
const glassmorphismStyleArb: fc.Arbitrary<GlassmorphismStyle> = fc.record({
  backdrop: backdropBlurArb,
  background: transparentBackgroundArb,
  border: borderWithTransparencyArb,
  radius: borderRadiusArb,
});

/**
 * **Feature: ui-redesign-v07, Property 2: Glassmorphism style composition**
 * **Validates: Requirements 4.1, 5.1**
 * 
 * For any component using glassmorphism styling, the composed class string
 * SHALL contain all required glassmorphism properties:
 * - backdrop-blur
 * - semi-transparent background
 * - border with transparency
 * - border-radius
 */
describe('Property 2: Glassmorphism style composition', () => {
  it('should compose valid glassmorphism classes for any valid style configuration', () => {
    fc.assert(
      fc.property(glassmorphismStyleArb, (style) => {
        const composed = composeGlassmorphismClasses(style);
        const validation = validateGlassmorphismClasses(composed);
        
        // All required properties must be present
        expect(validation.valid).toBe(true);
        expect(validation.hasBackdropBlur).toBe(true);
        expect(validation.hasTransparentBackground).toBe(true);
        expect(validation.hasBorderWithTransparency).toBe(true);
        expect(validation.hasBorderRadius).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should validate the default GLASS_STYLE contains all required properties', () => {
    const composed = composeGlassmorphismClasses(GLASS_STYLE);
    const validation = validateGlassmorphismClasses(composed);
    
    expect(validation.valid).toBe(true);
    expect(validation.hasBackdropBlur).toBe(true);
    expect(validation.hasTransparentBackground).toBe(true);
    expect(validation.hasBorderWithTransparency).toBe(true);
    expect(validation.hasBorderRadius).toBe(true);
  });

  it('should detect missing glassmorphism properties', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'bg-black/40 border border-white/10 rounded-2xl', // missing backdrop-blur
          'backdrop-blur-md border border-white/10 rounded-2xl', // missing transparent bg
          'backdrop-blur-md bg-black/40 rounded-2xl', // missing border
          'backdrop-blur-md bg-black/40 border border-white/10', // missing radius
        ),
        (incompleteClasses) => {
          const validation = validateGlassmorphismClasses(incompleteClasses);
          expect(validation.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
