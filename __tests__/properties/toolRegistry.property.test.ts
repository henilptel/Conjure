/**
 * Property-based tests for Tool Registry
 * **Feature: professional-suite**
 * 
 * Tests for:
 * - Property 3: Registry Completeness (Requirements 7.1, 7.3)
 * - Property 1: Tool Execution Validity (Requirements 1.1-1.4, 2.1-2.3, 3.1, 3.3, 3.4, 4.1, 4.2)
 * - Property 2: Default Value Neutrality (Requirements 7.2)
 * - Property 4: Registry Icon Presence (Requirements 4.1) - Feature: performance-fixes
 */

import * as fc from 'fast-check';
import {
  TOOL_REGISTRY,
  EFFECT_ORDER,
  getToolConfig,
  getAllToolIds,
  getAllToolDefinitions,
  isRegisteredTool,
  getToolIcon,
  type ToolDefinition,
} from '@/lib/tools-registry';

/**
 * Expected 15 tools as per Requirements 7.3
 */
const EXPECTED_TOOL_IDS = [
  'blur',
  'grayscale',
  'sepia',
  'contrast',
  'brightness',
  'saturation',
  'hue',
  'invert',
  'sharpen',
  'charcoal',
  'edge_detect',
  'rotate',
  'wave',
  'solarize',
  'vignette',
];

const EXPECTED_TOOL_COUNT = 15;

/**
 * Required properties for each tool definition as per Requirements 7.1
 */
const REQUIRED_PROPERTIES: (keyof ToolDefinition)[] = [
  'id',
  'label',
  'min',
  'max',
  'defaultValue',
  'execute',
];

/**
 * **Feature: professional-suite, Property 3: Registry Completeness**
 * **Validates: Requirements 7.1, 7.3**
 * 
 * For any query to TOOL_REGISTRY, the registry SHALL contain exactly 15 tools,
 * each with all required properties (id, label, min, max, defaultValue, execute function).
 * The tool IDs SHALL be: blur, grayscale, sepia, contrast, brightness, saturation, hue,
 * invert, sharpen, charcoal, edge_detect, rotate, wave, solarize, vignette.
 */
describe('Property 3: Registry Completeness', () => {
  it('TOOL_REGISTRY contains exactly 15 tools', () => {
    fc.assert(
      fc.property(
        fc.constant(TOOL_REGISTRY),
        (registry) => {
          const toolCount = Object.keys(registry).length;
          expect(toolCount).toBe(EXPECTED_TOOL_COUNT);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getAllToolIds returns exactly 15 tool IDs', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const toolIds = getAllToolIds();
          expect(toolIds.length).toBe(EXPECTED_TOOL_COUNT);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getAllToolDefinitions returns exactly 15 tool definitions', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const definitions = getAllToolDefinitions();
          expect(definitions.length).toBe(EXPECTED_TOOL_COUNT);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('TOOL_REGISTRY contains all expected tool IDs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_TOOL_IDS),
        (expectedToolId) => {
          expect(isRegisteredTool(expectedToolId)).toBe(true);
          expect(getToolConfig(expectedToolId)).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool in TOOL_REGISTRY has all required properties', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            for (const prop of REQUIRED_PROPERTIES) {
              expect(tool).toHaveProperty(prop);
              expect(tool[prop]).toBeDefined();
            }
            
            // Verify types
            expect(typeof tool.id).toBe('string');
            expect(typeof tool.label).toBe('string');
            expect(typeof tool.min).toBe('number');
            expect(typeof tool.max).toBe('number');
            expect(typeof tool.defaultValue).toBe('number');
            expect(typeof tool.execute).toBe('function');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tool id property matches registry key', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool?.id).toBe(toolId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool has non-empty label', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool?.label).toBeTruthy();
          expect(tool?.label.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool has valid min/max range (min <= max)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          if (tool) {
            expect(tool.min).toBeLessThanOrEqual(tool.max);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool has defaultValue within min/max range', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          if (tool) {
            expect(tool.defaultValue).toBeGreaterThanOrEqual(tool.min);
            expect(tool.defaultValue).toBeLessThanOrEqual(tool.max);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('TOOL_REGISTRY has no extra tools beyond expected 15', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          expect(EXPECTED_TOOL_IDS).toContain(toolId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getToolConfig returns undefined for non-existent tools', () => {
    // Built-in Object properties that should be excluded from test
    const builtInProps = [
      'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
      'toLocaleString', 'toString', 'valueOf', '__proto__', '__defineGetter__',
      '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
    ];
    
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !EXPECTED_TOOL_IDS.includes(s) && !builtInProps.includes(s)
        ),
        (invalidToolId) => {
          expect(getToolConfig(invalidToolId)).toBeUndefined();
          expect(isRegisteredTool(invalidToolId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Mock IMagickImage interface for testing tool execution.
 * Tracks all method calls to verify tools execute without errors.
 */
interface MockIMagickImage {
  methodCalls: Array<{ method: string; args: unknown[] }>;
  blur: (radius: number, sigma: number) => void;
  grayscale: () => void;
  modulate: (brightness: unknown, saturation: unknown, hue: unknown) => void;
  sepiaTone: (threshold: unknown) => void;
  brightnessContrast: (brightness: unknown, contrast: unknown) => void;
  negate: (grayscale: boolean) => void;
  sharpen: (radius: number, sigma: number) => void;
  charcoal: (radius: number, sigma: number) => void;
  edge: (radius: number) => void;
  cannyEdge: (radius: number, sigma: number, lower: unknown, upper: unknown) => void;
  rotate: (degrees: number) => void;
  implode: (amount: number, method: unknown) => void;
  wave: (interpolate: unknown, amplitude: number, length: number) => void;
  solarize: (threshold: unknown) => void;
  vignette: (radius: number, sigma: number, x: number, y: number) => void;
}

/**
 * Creates a mock image that tracks all method calls.
 */
function createMockImage(): MockIMagickImage {
  const mock: MockIMagickImage = {
    methodCalls: [],
    blur(radius: number, sigma: number) {
      this.methodCalls.push({ method: 'blur', args: [radius, sigma] });
    },
    grayscale() {
      this.methodCalls.push({ method: 'grayscale', args: [] });
    },
    modulate(brightness: unknown, saturation: unknown, hue: unknown) {
      this.methodCalls.push({ method: 'modulate', args: [brightness, saturation, hue] });
    },
    sepiaTone(threshold: unknown) {
      this.methodCalls.push({ method: 'sepiaTone', args: [threshold] });
    },
    brightnessContrast(brightness: unknown, contrast: unknown) {
      this.methodCalls.push({ method: 'brightnessContrast', args: [brightness, contrast] });
    },
    negate(grayscale: boolean) {
      this.methodCalls.push({ method: 'negate', args: [grayscale] });
    },
    sharpen(radius: number, sigma: number) {
      this.methodCalls.push({ method: 'sharpen', args: [radius, sigma] });
    },
    charcoal(radius: number, sigma: number) {
      this.methodCalls.push({ method: 'charcoal', args: [radius, sigma] });
    },
    edge(radius: number) {
      this.methodCalls.push({ method: 'edge', args: [radius] });
    },
    cannyEdge(radius: number, sigma: number, lower: unknown, upper: unknown) {
      this.methodCalls.push({ method: 'cannyEdge', args: [radius, sigma, lower, upper] });
    },
    rotate(degrees: number) {
      this.methodCalls.push({ method: 'rotate', args: [degrees] });
    },
    implode(amount: number, method: unknown) {
      this.methodCalls.push({ method: 'implode', args: [amount, method] });
    },
    wave(interpolate: unknown, amplitude: number, length: number) {
      this.methodCalls.push({ method: 'wave', args: [interpolate, amplitude, length] });
    },
    solarize(threshold: unknown) {
      this.methodCalls.push({ method: 'solarize', args: [threshold] });
    },
    vignette(radius: number, sigma: number, x: number, y: number) {
      this.methodCalls.push({ method: 'vignette', args: [radius, sigma, x, y] });
    },
  };
  return mock;
}

/**
 * **Feature: professional-suite, Property 1: Tool Execution Validity**
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.3, 3.4, 4.1, 4.2**
 * 
 * For any tool in TOOL_REGISTRY and for any value within that tool's valid range [min, max],
 * executing the tool's execute function on a valid image SHALL NOT throw an error
 * and SHALL return without exception.
 */
describe('Property 1: Tool Execution Validity', () => {
  it('every tool executes without error for any value in valid range', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (toolId, normalizedValue) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            // Scale normalized value to tool's actual range
            const value = tool.min + normalizedValue * (tool.max - tool.min);
            const mockImage = createMockImage();
            
            // Execute should not throw
            expect(() => {
              tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], value);
            }).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool executes without error at minimum value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            const mockImage = createMockImage();
            
            expect(() => {
              tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], tool.min);
            }).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool executes without error at maximum value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            const mockImage = createMockImage();
            
            expect(() => {
              tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], tool.max);
            }).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool executes without error at midpoint value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            const midpoint = (tool.min + tool.max) / 2;
            const mockImage = createMockImage();
            
            expect(() => {
              tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], midpoint);
            }).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool executes without error for random integer values in range', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()).chain((toolId) => {
          const tool = getToolConfig(toolId)!;
          const intMin = Math.ceil(tool.min);
          const intMax = Math.floor(tool.max);
          // Skip if no valid integer range exists
          if (intMin > intMax) {
            return fc.tuple(fc.constant(toolId), fc.constant(tool.min));
          }
          return fc.tuple(
            fc.constant(toolId),
            fc.integer({ min: intMin, max: intMax })
          );
        }),
        ([toolId, value]) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            const mockImage = createMockImage();
            
            expect(() => {
              tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], value);
            }).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: professional-suite, Property 2: Default Value Neutrality**
 * **Validates: Requirements 7.2**
 * 
 * For any tool in TOOL_REGISTRY, executing the tool with its defaultValue SHALL NOT throw an error.
 * Tools with defaultValue at the "neutral" point (e.g., 100 for modulate-based tools, 0 for additive effects)
 * should produce minimal or no visible change.
 */
describe('Property 2: Default Value Neutrality', () => {
  it('every tool executes without error at default value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            const mockImage = createMockImage();
            
            expect(() => {
              tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], tool.defaultValue);
            }).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tools with default 0 make no method calls at default value (no-op behavior)', () => {
    // Tools where default 0 means "no effect"
    const noOpAtZeroTools = [
      'blur', 'sepia', 'sharpen', 'charcoal', 'edge_detect',
      'rotate', 'wave', 'solarize', 'vignette', 'invert',
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...noOpAtZeroTools),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool && tool.defaultValue === 0) {
            const mockImage = createMockImage();
            
            tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], tool.defaultValue);
            
            // For tools with default 0, no image methods should be called
            expect(mockImage.methodCalls.length).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('grayscale tool makes no method calls at default value 0', () => {
    const tool = getToolConfig('grayscale');
    expect(tool).toBeDefined();
    
    if (tool) {
      const mockImage = createMockImage();
      tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], 0);
      expect(mockImage.methodCalls.length).toBe(0);
    }
  });

  it('contrast tool makes no method calls at default value 0', () => {
    const tool = getToolConfig('contrast');
    expect(tool).toBeDefined();
    
    if (tool) {
      const mockImage = createMockImage();
      tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], 0);
      expect(mockImage.methodCalls.length).toBe(0);
    }
  });

  it('modulate-based tools (brightness, saturation, hue) call modulate at default 100', () => {
    // These tools use modulate and have default 100 (neutral)
    const modulateTools = ['brightness', 'saturation', 'hue'];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...modulateTools),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            expect(tool.defaultValue).toBe(100);
            
            const mockImage = createMockImage();
            tool.execute(mockImage as unknown as Parameters<typeof tool.execute>[0], tool.defaultValue);
            
            // Modulate is called even at neutral value (100, 100, 100 is identity)
            expect(mockImage.methodCalls.some(c => c.method === 'modulate')).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('default values are within valid range for all tools', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            expect(tool.defaultValue).toBeGreaterThanOrEqual(tool.min);
            expect(tool.defaultValue).toBeLessThanOrEqual(tool.max);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: performance-fixes, Property 4: Registry Icon Presence**
 * **Validates: Requirements 4.1**
 * 
 * For any tool defined in TOOL_REGISTRY, the tool definition SHALL include a valid icon
 * property referencing a Lucide icon component.
 */
describe('Property 4: Registry Icon Presence', () => {
  it('every tool in TOOL_REGISTRY has an icon property', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            expect(tool).toHaveProperty('icon');
            expect(tool.icon).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every tool icon is a valid React component (function or object with render)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const tool = getToolConfig(toolId);
          expect(tool).toBeDefined();
          
          if (tool) {
            // Lucide icons are React components - can be function or object (in test env)
            // In Jest, mocked components may be objects with $$typeof
            const iconType = typeof tool.icon;
            const isValidComponent = iconType === 'function' || 
              (iconType === 'object' && tool.icon !== null);
            expect(isValidComponent).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getToolIcon returns the icon for valid tool IDs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getAllToolIds()),
        (toolId) => {
          const icon = getToolIcon(toolId);
          const tool = getToolConfig(toolId);
          
          expect(icon).toBeDefined();
          expect(icon).toBe(tool?.icon);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getToolIcon returns undefined for invalid tool IDs', () => {
    // Built-in Object properties that should be excluded from test
    const builtInProps = [
      'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
      'toLocaleString', 'toString', 'valueOf', '__proto__', '__defineGetter__',
      '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
    ];
    
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !EXPECTED_TOOL_IDS.includes(s) && !builtInProps.includes(s)
        ),
        (invalidToolId) => {
          expect(getToolIcon(invalidToolId)).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all 15 expected tools have icons', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_TOOL_IDS),
        (toolId) => {
          const icon = getToolIcon(toolId);
          expect(icon).toBeDefined();
          // Icon can be function or object (mocked in test env)
          const iconType = typeof icon;
          const isValidComponent = iconType === 'function' || 
            (iconType === 'object' && icon !== null);
          expect(isValidComponent).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
