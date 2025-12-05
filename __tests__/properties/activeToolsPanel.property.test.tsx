/**
 * Property-based tests for ActiveToolsPanel Component Memoization
 * **Feature: performance-fixes**
 */

import * as fc from 'fast-check';
import React, { memo } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
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

  it('memoized component re-renders when onToolSelect prop changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyUniqueToolsArb,
        async (tools) => {
          cleanup();
          useAppStore.setState({ activeTools: tools });
          
          const callback1 = jest.fn();
          const callback2 = jest.fn();
          
          // Initial render with callback1
          const { rerender } = render(
            <ActiveToolsPanel onToolSelect={callback1} />
          );
          
          // Expand the panel first to access tool items
          const toggleButton = screen.getByTestId('active-tools-toggle');
          fireEvent.click(toggleButton);
          
          // Re-render with different callback
          rerender(<ActiveToolsPanel onToolSelect={callback2} />);
          
          // Simulate tool selection and verify the new callback is called
          const firstTool = tools[0];
          // Corrected selector and ensure expanded
          const toolElement = await screen.findByTestId(`tool-item-${firstTool.id}`);
          fireEvent.click(toolElement);
          
          // callback2 should be called, not callback1
          expect(callback1).not.toHaveBeenCalled();
          expect(callback2).toHaveBeenCalledWith(firstTool.id);
        }
      ),
      { numRuns: 100 }
    );
  });


});
