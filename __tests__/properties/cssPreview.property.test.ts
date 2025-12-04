/**
 * Property-based tests for CSS filter preview utilities
 * 
 * Tests the mapping of ImageMagick tool values to CSS filter equivalents
 * for instant visual feedback during slider interactions.
 */

import * as fc from 'fast-check';
import {
  mapToolsToCSSPreview,
  hasUnsupportedEffects,
  getUnsupportedToolIds,
  CSS_FILTER_SUPPORT,
} from '@/lib/css-preview';
import type { ActiveTool } from '@/lib/types';
import { TOOL_REGISTRY } from '@/lib/tools-registry';

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * Generate an arbitrary ActiveTool based on TOOL_REGISTRY
 */
const arbActiveTool = (toolId: string): fc.Arbitrary<ActiveTool> => {
  const config = TOOL_REGISTRY[toolId];
  if (!config) {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  return fc.integer({ min: config.min, max: config.max }).map(value => ({
    id: config.id,
    label: config.label,
    value,
    min: config.min,
    max: config.max,
  }));
};

/**
 * Generate an arbitrary array of active tools
 */
const arbActiveTools: fc.Arbitrary<ActiveTool[]> = fc.array(
  fc.constantFrom(...Object.keys(TOOL_REGISTRY)),
  { minLength: 0, maxLength: 5 }
).chain(toolIds => {
  const uniqueIds = [...new Set(toolIds)];
  return fc.tuple(...uniqueIds.map(id => arbActiveTool(id)));
});

// ============================================================================
// Tests
// ============================================================================

describe('CSS Preview Utilities', () => {
  describe('mapToolsToCSSPreview', () => {
    it('returns "none" filter for empty tools array', () => {
      const result = mapToolsToCSSPreview([]);
      expect(result.filter).toBe('none');
      expect(result.transform).toBe('');
      expect(result.hasEffects).toBe(false);
      expect(result.unsupportedTools).toEqual([]);
    });

    it('property: always returns valid filter string', () => {
      fc.assert(
        fc.property(arbActiveTools, (tools) => {
          const result = mapToolsToCSSPreview(tools);
          
          // Filter must be a string
          expect(typeof result.filter).toBe('string');
          
          // Filter must be either 'none' or contain valid CSS filter functions
          if (result.filter !== 'none') {
            // Valid CSS filter functions
            const validFilters = [
              'blur', 'brightness', 'contrast', 'grayscale',
              'hue-rotate', 'invert', 'saturate', 'sepia'
            ];
            const hasValidFilter = validFilters.some(f => result.filter.includes(f));
            expect(hasValidFilter).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('property: blur tool maps to CSS blur filter', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (blurValue) => {
            const tools: ActiveTool[] = [{
              id: 'blur',
              label: 'Blur',
              value: blurValue,
              min: 0,
              max: 20,
            }];
            
            const result = mapToolsToCSSPreview(tools);
            expect(result.filter).toContain(`blur(${blurValue}px)`);
            expect(result.hasEffects).toBe(true);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('property: brightness 100 (neutral) produces no filter', () => {
      const tools: ActiveTool[] = [{
        id: 'brightness',
        label: 'Brightness',
        value: 100,
        min: 0,
        max: 200,
      }];
      
      const result = mapToolsToCSSPreview(tools);
      expect(result.filter).toBe('none');
    });

    it('property: brightness maps correctly to CSS', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 200 }).filter(v => v !== 100),
          (brightness) => {
            const tools: ActiveTool[] = [{
              id: 'brightness',
              label: 'Brightness',
              value: brightness,
              min: 0,
              max: 200,
            }];
            
            const result = mapToolsToCSSPreview(tools);
            const expectedValue = brightness / 100;
            expect(result.filter).toContain(`brightness(${expectedValue})`);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('property: rotate maps to CSS transform, not filter', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -180, max: 180 }).filter(v => v !== 0),
          (angle) => {
            const tools: ActiveTool[] = [{
              id: 'rotate',
              label: 'Rotate',
              value: angle,
              min: -180,
              max: 180,
            }];
            
            const result = mapToolsToCSSPreview(tools);
            expect(result.transform).toBe(`rotate(${angle}deg)`);
            expect(result.filter).toBe('none'); // Rotation doesn't use filter
            expect(result.hasEffects).toBe(true);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('property: unsupported tools are tracked', () => {
      const unsupportedToolIds = ['sharpen', 'charcoal', 'edge_detect', 'solarize', 'vignette', 'wave'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...unsupportedToolIds),
          fc.integer({ min: 1, max: 10 }),
          (toolId, value) => {
            const config = TOOL_REGISTRY[toolId];
            const tools: ActiveTool[] = [{
              id: toolId,
              label: config.label,
              value: Math.min(value, config.max),
              min: config.min,
              max: config.max,
            }];
            
            const result = mapToolsToCSSPreview(tools);
            expect(result.unsupportedTools).toContain(toolId);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('property: multiple tools combine into single filter string', () => {
      fc.assert(
        fc.property(arbActiveTools, (tools) => {
          const result = mapToolsToCSSPreview(tools);
          
          // Count expected filter functions (excluding unsupported and neutral values)
          const supportedFilters = tools.filter(t => {
            const support = CSS_FILTER_SUPPORT[t.id];
            if (support === 'none') return false;
            if (t.id === 'rotate') return false; // Handled by transform
            
            // Check for neutral values
            if (t.id === 'blur' && t.value <= 0) return false;
            if (t.id === 'brightness' && t.value === 100) return false;
            if (t.id === 'saturation' && t.value === 100) return false;
            if (t.id === 'hue' && t.value === 100) return false;
            if (t.id === 'contrast' && t.value === 0) return false;
            if (['grayscale', 'sepia', 'invert'].includes(t.id) && t.value <= 0) return false;
            
            return true;
          });
          
          // If there are supported filters, the result shouldn't be 'none'
          if (supportedFilters.length > 0) {
            expect(result.filter).not.toBe('none');
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('hasUnsupportedEffects', () => {
    it('returns false for empty tools', () => {
      expect(hasUnsupportedEffects([])).toBe(false);
    });

    it('returns false for fully supported tools', () => {
      const tools: ActiveTool[] = [
        { id: 'blur', label: 'Blur', value: 5, min: 0, max: 20 },
        { id: 'brightness', label: 'Brightness', value: 150, min: 0, max: 200 },
      ];
      expect(hasUnsupportedEffects(tools)).toBe(false);
    });

    it('returns true when unsupported tool is present', () => {
      const tools: ActiveTool[] = [
        { id: 'blur', label: 'Blur', value: 5, min: 0, max: 20 },
        { id: 'charcoal', label: 'Charcoal', value: 3, min: 0, max: 10 },
      ];
      expect(hasUnsupportedEffects(tools)).toBe(true);
    });
  });

  describe('getUnsupportedToolIds', () => {
    it('returns empty array for supported tools', () => {
      const tools: ActiveTool[] = [
        { id: 'blur', label: 'Blur', value: 5, min: 0, max: 20 },
      ];
      expect(getUnsupportedToolIds(tools)).toEqual([]);
    });

    it('returns unsupported tool IDs', () => {
      const tools: ActiveTool[] = [
        { id: 'blur', label: 'Blur', value: 5, min: 0, max: 20 },
        { id: 'charcoal', label: 'Charcoal', value: 3, min: 0, max: 10 },
        { id: 'edge_detect', label: 'Edge Detect', value: 2, min: 0, max: 10 },
      ];
      const unsupported = getUnsupportedToolIds(tools);
      expect(unsupported).toContain('charcoal');
      expect(unsupported).toContain('edge_detect');
      expect(unsupported).not.toContain('blur');
    });
  });

  describe('CSS_FILTER_SUPPORT constant', () => {
    it('has entries for all tools in TOOL_REGISTRY', () => {
      const toolIds = Object.keys(TOOL_REGISTRY);
      for (const toolId of toolIds) {
        expect(CSS_FILTER_SUPPORT[toolId]).toBeDefined();
        expect(['full', 'approximate', 'none']).toContain(CSS_FILTER_SUPPORT[toolId]);
      }
    });
  });
});
