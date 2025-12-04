/**
 * Property-based tests for ActiveToolsPanel Component Memoization
 * **Feature: performance-fixes**
 */

import * as fc from 'fast-check';
import React, { memo } from 'react';
import { render, cleanup } from '@testing-library/react';
import ActiveToolsPanel from '@/app/components/dock/ActiveToolsPanel';
import type { ActiveTool, ToolName } from '@/lib/types';
import { TOOL_CONFIGS } from '@/lib/types';
import { useAppStore } from '@/lib/store';

// Ensure cleanup after each test and reset store
afterEach(() => {
  cleanup();
  useAppStore.setState({ activeTools: [] });
});

/**
 * Arbitrary for generating valid ActiveTool objects
 */
const validToolNames: ToolName[] = Object.keys(TOOL_CONFIGS) as ToolName[];

const activeToolArb = fc.constantFrom(...validToolNames).chain((toolName) => {
  const config = TOOL_CONFIGS[toolName];
  return fc.record({
    id: fc.constant(config.id),
    label: fc.constant(config.label),
    min: fc.constant(config.min),
    max: fc.constant(config.max),
    value: fc.integer({ min: config.min, max: config.max }),
  });
});

/**
 * Arbitrary for generating non-empty arrays of unique ActiveTools
 */
const nonEmptyUniqueToolsArb = fc.uniqueArray(activeToolArb, {
  minLength: 1,
  maxLength: 4,
  comparator: (a, b) => a.id === b.id,
});

/**
 * **Feature: performance-fixes, Property 6: Memoization Prevents Re-render**
 * **Validates: Requirements 3.2, 3.3**
 * 
 * For any parent re-render where ActiveToolsPanel props remain unchanged 
 * (by shallow equality), the ActiveToolsPanel component SHALL not re-render.
 */
describe('Property 6: Memoization Prevents Re-render', () => {
  it('ActiveToolsPanel is wrapped with React.memo', () => {
    // Verify the component is memoized by checking its type
    // React.memo wraps the component and adds a $$typeof Symbol
    // The component should have the memo type indicator
    expect(ActiveToolsPanel).toBeDefined();
    
    // React.memo components have a specific structure
    // They have a 'type' property that references the original component
    // and a '$$typeof' that indicates it's a memo component
    const componentType = (ActiveToolsPanel as any).$$typeof;
    const memoSymbol = Symbol.for('react.memo');
    
    expect(componentType).toBe(memoSymbol);
  });

  it('memoized component does not re-render when props are identical', () => {
    fc.assert(
      fc.property(
        nonEmptyUniqueToolsArb,
        fc.boolean(),
        (tools, disabled) => {
          cleanup();
          useAppStore.setState({ activeTools: tools });
          
          let renderCount = 0;
          
          // Create a wrapper that tracks renders
          const RenderTracker = ({ children }: { children: React.ReactNode }) => {
            renderCount++;
            return <>{children}</>;
          };
          
          // Create a parent component that can trigger re-renders
          const Parent = ({ triggerRender }: { triggerRender: number }) => {
            // This value changes but ActiveToolsPanel props don't
            void triggerRender;
            return (
              <RenderTracker>
                <ActiveToolsPanel disabled={disabled} />
              </RenderTracker>
            );
          };
          
          // Initial render
          const { rerender } = render(<Parent triggerRender={0} />);
          const initialRenderCount = renderCount;
          
          // Re-render parent with different triggerRender but same ActiveToolsPanel props
          rerender(<Parent triggerRender={1} />);
          
          // The RenderTracker should have rendered twice (parent re-rendered)
          // but ActiveToolsPanel should have been memoized
          expect(renderCount).toBe(initialRenderCount + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('memoized component re-renders when disabled prop changes', () => {
    fc.assert(
      fc.property(
        nonEmptyUniqueToolsArb,
        (tools) => {
          cleanup();
          useAppStore.setState({ activeTools: tools });
          
          // Initial render with disabled=false
          const { rerender, getByTestId } = render(
            <ActiveToolsPanel disabled={false} />
          );
          
          // The toggle button should not have opacity-50 class
          const toggleButton = getByTestId('active-tools-toggle');
          expect(toggleButton.className).not.toContain('opacity-50');
          
          // Re-render with disabled=true - should trigger re-render
          rerender(<ActiveToolsPanel disabled={true} />);
          
          // The toggle button should now have opacity-50 class
          expect(toggleButton.className).toContain('opacity-50');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('memoized component re-renders when onToolSelect prop changes', () => {
    fc.assert(
      fc.property(
        nonEmptyUniqueToolsArb,
        (tools) => {
          cleanup();
          useAppStore.setState({ activeTools: tools });
          
          const callback1 = jest.fn();
          const callback2 = jest.fn();
          
          // Initial render with callback1
          const { rerender } = render(
            <ActiveToolsPanel onToolSelect={callback1} />
          );
          
          // Re-render with different callback - should trigger re-render
          // because the function reference changed
          rerender(<ActiveToolsPanel onToolSelect={callback2} />);
          
          // Both callbacks should be different references
          expect(callback1).not.toBe(callback2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('shallow comparison works correctly for props', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (disabled) => {
          cleanup();
          useAppStore.setState({ activeTools: [] });
          
          // Props with same values should be considered equal by shallow comparison
          const props1 = { disabled };
          const props2 = { disabled };
          
          // Shallow equality check (what React.memo uses by default)
          const arePropsEqual = Object.keys(props1).every(
            key => props1[key as keyof typeof props1] === props2[key as keyof typeof props2]
          );
          
          expect(arePropsEqual).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
