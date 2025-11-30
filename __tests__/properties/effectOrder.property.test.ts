/**
 * Property-based tests for Effect Application Order
 * **Feature: optimization-architecture, Property 5: Effect order consistency**
 * **Validates: Requirements 2.4**
 */

import * as fc from 'fast-check';
import {
  TOOL_REGISTRY,
  EFFECT_ORDER,
  getToolConfig,
  getAllToolIds,
  type ToolDefinition,
} from '@/lib/tools-registry';
import type { ActiveTool } from '@/lib/types';

const validToolIds = getAllToolIds();

/**
 * Helper function to sort tools by effect order (same logic as in applyEffectsPipeline)
 * This mirrors the sorting logic that will be used in the pipeline.
 */
function sortToolsByEffectOrder(tools: ActiveTool[]): ActiveTool[] {
  return [...tools].sort((a, b) => {
    const aIndex = EFFECT_ORDER.indexOf(a.id);
    const bIndex = EFFECT_ORDER.indexOf(b.id);
    return aIndex - bIndex;
  });
}

/**
 * Generate an ActiveTool from the registry with a random value within its valid range
 */
const activeToolFromRegistryArb = (toolId: string) => {
  const config = TOOL_REGISTRY[toolId];
  if (!config) {
    throw new Error(`Tool ${toolId} not found in registry`);
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
 * Generate a set of unique tools from the registry with random values
 */
const uniqueToolsFromRegistryArb = fc.subarray(validToolIds, { minLength: 1, maxLength: validToolIds.length })
  .chain(ids => {
    const toolArbs = ids.map(id => activeToolFromRegistryArb(id));
    return fc.tuple(...toolArbs);
  })
  .map(tools => tools as ActiveTool[]);

/**
 * **Feature: optimization-architecture, Property 5: Effect order consistency**
 * **Validates: Requirements 2.4**
 * 
 * For any set of active tools provided in any order, the pipeline should apply 
 * effects in the order defined by EFFECT_ORDER, producing consistent results.
 */
describe('Property 5: Effect order consistency', () => {
  it('tools are sorted in consistent order regardless of input order', () => {
    fc.assert(
      fc.property(
        // Generate tools and two different permutations using fast-check
        uniqueToolsFromRegistryArb.chain(tools => 
          fc.tuple(
            fc.constant(tools),
            fc.shuffledSubarray(tools, { minLength: tools.length, maxLength: tools.length }),
            fc.shuffledSubarray(tools, { minLength: tools.length, maxLength: tools.length })
          )
        ),
        ([tools, shuffled1, shuffled2]) => {
          // Sort all versions
          const sorted1 = sortToolsByEffectOrder(tools);
          const sorted2 = sortToolsByEffectOrder(shuffled1);
          const sorted3 = sortToolsByEffectOrder(shuffled2);
          
          // All sorted versions should have the same order of tool ids
          const ids1 = sorted1.map(t => t.id);
          const ids2 = sorted2.map(t => t.id);
          const ids3 = sorted3.map(t => t.id);
          
          expect(ids1).toEqual(ids2);
          expect(ids2).toEqual(ids3);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sorted tools follow the expected effect order from EFFECT_ORDER', () => {
    fc.assert(
      fc.property(
        uniqueToolsFromRegistryArb,
        (tools) => {
          const sorted = sortToolsByEffectOrder(tools);
          
          // Verify the order is correct according to EFFECT_ORDER
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentIndex = EFFECT_ORDER.indexOf(sorted[i].id);
            const nextIndex = EFFECT_ORDER.indexOf(sorted[i + 1].id);
            
            // Current tool should come before next tool in the effect order
            expect(currentIndex).toBeLessThan(nextIndex);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tools with same values produce identical sorted arrays regardless of input permutation', () => {
    fc.assert(
      fc.property(
        // Generate values for all 4 tools from registry
        fc.tuple(
          fc.integer({ min: TOOL_REGISTRY.blur.min, max: TOOL_REGISTRY.blur.max }),
          fc.integer({ min: TOOL_REGISTRY.grayscale.min, max: TOOL_REGISTRY.grayscale.max }),
          fc.integer({ min: TOOL_REGISTRY.sepia.min, max: TOOL_REGISTRY.sepia.max }),
          fc.integer({ min: TOOL_REGISTRY.contrast.min, max: TOOL_REGISTRY.contrast.max })
        ),
        ([blurVal, grayscaleVal, sepiaVal, contrastVal]) => {
          // Create tools with these values from registry
          const blur: ActiveTool = { 
            id: 'blur', label: TOOL_REGISTRY.blur.label, value: blurVal,
            min: TOOL_REGISTRY.blur.min, max: TOOL_REGISTRY.blur.max 
          };
          const grayscale: ActiveTool = { 
            id: 'grayscale', label: TOOL_REGISTRY.grayscale.label, value: grayscaleVal,
            min: TOOL_REGISTRY.grayscale.min, max: TOOL_REGISTRY.grayscale.max 
          };
          const sepia: ActiveTool = { 
            id: 'sepia', label: TOOL_REGISTRY.sepia.label, value: sepiaVal,
            min: TOOL_REGISTRY.sepia.min, max: TOOL_REGISTRY.sepia.max 
          };
          const contrast: ActiveTool = { 
            id: 'contrast', label: TOOL_REGISTRY.contrast.label, value: contrastVal,
            min: TOOL_REGISTRY.contrast.min, max: TOOL_REGISTRY.contrast.max 
          };
          
          // Different input orders
          const order1 = [blur, grayscale, sepia, contrast];
          const order2 = [contrast, sepia, grayscale, blur];
          const order3 = [sepia, blur, contrast, grayscale];
          const order4 = [grayscale, contrast, blur, sepia];
          
          // Sort all
          const sorted1 = sortToolsByEffectOrder(order1);
          const sorted2 = sortToolsByEffectOrder(order2);
          const sorted3 = sortToolsByEffectOrder(order3);
          const sorted4 = sortToolsByEffectOrder(order4);
          
          // All should produce identical results
          expect(sorted1).toEqual(sorted2);
          expect(sorted2).toEqual(sorted3);
          expect(sorted3).toEqual(sorted4);
          
          // And the order should match EFFECT_ORDER
          expect(sorted1.map(t => t.id)).toEqual(EFFECT_ORDER);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('partial tool sets maintain correct relative order', () => {
    fc.assert(
      fc.property(
        fc.subarray(validToolIds, { minLength: 2, maxLength: 3 }),
        (toolIds) => {
          // Create tools from the subset using registry
          const tools = toolIds.map(id => {
            const config = TOOL_REGISTRY[id];
            return {
              id: config.id,
              label: config.label,
              value: config.defaultValue,
              min: config.min,
              max: config.max,
            };
          });
          
          // Shuffle and sort
          const shuffled = [...tools].reverse();
          const sorted = sortToolsByEffectOrder(shuffled);
          
          // Verify relative order matches EFFECT_ORDER
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentEffectIndex = EFFECT_ORDER.indexOf(sorted[i].id);
            const nextEffectIndex = EFFECT_ORDER.indexOf(sorted[i + 1].id);
            
            expect(currentEffectIndex).toBeLessThan(nextEffectIndex);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('single tool arrays remain unchanged after sorting', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validToolIds),
        (toolId) => {
          const config = TOOL_REGISTRY[toolId];
          const tool: ActiveTool = {
            id: config.id,
            label: config.label,
            value: config.defaultValue,
            min: config.min,
            max: config.max,
          };
          const sorted = sortToolsByEffectOrder([tool]);
          
          expect(sorted.length).toBe(1);
          expect(sorted[0]).toEqual(tool);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty tool arrays remain empty after sorting', () => {
    const sorted = sortToolsByEffectOrder([]);
    expect(sorted).toEqual([]);
  });
});
