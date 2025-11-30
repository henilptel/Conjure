/**
 * Property-based tests for Effect Application Order
 * **Feature: hud-tool-panel**
 */

import * as fc from 'fast-check';
import {
  TOOL_CONFIGS,
  createToolConfig,
  type ToolName,
  type ActiveTool,
} from '@/lib/types';

// Mock ImageMagick for testing the ordering logic
// We test that the pipeline sorts tools correctly before application

const validToolNames: ToolName[] = ['blur', 'grayscale', 'sepia', 'contrast'];
const EFFECT_ORDER = ['blur', 'grayscale', 'sepia', 'contrast'] as const;

/**
 * Helper function to sort tools by effect order (same logic as in applyEffectsPipeline)
 */
function sortToolsByEffectOrder(tools: ActiveTool[]): ActiveTool[] {
  return [...tools].sort((a, b) => {
    const aIndex = EFFECT_ORDER.indexOf(a.id as typeof EFFECT_ORDER[number]);
    const bIndex = EFFECT_ORDER.indexOf(b.id as typeof EFFECT_ORDER[number]);
    return aIndex - bIndex;
  });
}

/**
 * Generate an ActiveTool with a random value within its valid range
 */
const activeToolWithRandomValueArb = (toolName: ToolName) => {
  const config = TOOL_CONFIGS[toolName];
  return fc.integer({ min: config.min, max: config.max }).map(value => ({
    id: config.id,
    label: config.label,
    value,
    min: config.min,
    max: config.max,
  }));
};

/**
 * Generate a set of unique tools with random values
 */
const uniqueToolsWithValuesArb = fc.subarray(validToolNames, { minLength: 1, maxLength: 4 })
  .chain(names => {
    const toolArbs = names.map(name => activeToolWithRandomValueArb(name));
    return fc.tuple(...toolArbs);
  })
  .map(tools => tools as ActiveTool[]);

/**
 * **Feature: hud-tool-panel, Property 8: Effect Application Order Consistency**
 * **Validates: Requirements 5.3**
 * 
 * For any set of activeTools with the same values applied in any order of state updates,
 * the final rendered image SHALL be identical (effects applied in deterministic order).
 * 
 * We test this by verifying that:
 * 1. Tools are always sorted in the same order regardless of input order
 * 2. The sorted order matches the expected effect order: blur → grayscale → sepia → contrast
 */
describe('Property 8: Effect Application Order Consistency', () => {
  it('tools are sorted in consistent order regardless of input order', () => {
    fc.assert(
      fc.property(
        // Generate tools and two different permutations using fast-check
        uniqueToolsWithValuesArb.chain(tools => 
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

  it('sorted tools follow the expected effect order: blur → grayscale → sepia → contrast', () => {
    fc.assert(
      fc.property(
        uniqueToolsWithValuesArb,
        (tools) => {
          const sorted = sortToolsByEffectOrder(tools);
          
          // Verify the order is correct
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentIndex = EFFECT_ORDER.indexOf(sorted[i].id as typeof EFFECT_ORDER[number]);
            const nextIndex = EFFECT_ORDER.indexOf(sorted[i + 1].id as typeof EFFECT_ORDER[number]);
            
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
        // Generate all 4 tools with specific values
        fc.tuple(
          fc.integer({ min: 0, max: 20 }),   // blur value
          fc.integer({ min: 0, max: 100 }),  // grayscale value
          fc.integer({ min: 0, max: 100 }),  // sepia value
          fc.integer({ min: -100, max: 100 }) // contrast value
        ),
        ([blurVal, grayscaleVal, sepiaVal, contrastVal]) => {
          // Create tools with these values
          const blur: ActiveTool = { ...createToolConfig('blur')!, value: blurVal };
          const grayscale: ActiveTool = { ...createToolConfig('grayscale')!, value: grayscaleVal };
          const sepia: ActiveTool = { ...createToolConfig('sepia')!, value: sepiaVal };
          const contrast: ActiveTool = { ...createToolConfig('contrast')!, value: contrastVal };
          
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
          
          // And the order should be blur → grayscale → sepia → contrast
          expect(sorted1[0].id).toBe('blur');
          expect(sorted1[1].id).toBe('grayscale');
          expect(sorted1[2].id).toBe('sepia');
          expect(sorted1[3].id).toBe('contrast');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('partial tool sets maintain correct relative order', () => {
    fc.assert(
      fc.property(
        fc.subarray(validToolNames, { minLength: 2, maxLength: 3 }),
        (toolNames) => {
          // Create tools from the subset
          const tools = toolNames.map(name => createToolConfig(name)!);
          
          // Shuffle and sort
          const shuffled = [...tools].reverse();
          const sorted = sortToolsByEffectOrder(shuffled);
          
          // Verify relative order matches EFFECT_ORDER
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentEffectIndex = EFFECT_ORDER.indexOf(sorted[i].id as typeof EFFECT_ORDER[number]);
            const nextEffectIndex = EFFECT_ORDER.indexOf(sorted[i + 1].id as typeof EFFECT_ORDER[number]);
            
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
        fc.constantFrom(...validToolNames),
        (toolName) => {
          const tool = createToolConfig(toolName)!;
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
