/**
 * Property-based tests for ToolPanel React Component
 * **Feature: hud-tool-panel**
 */

import * as fc from 'fast-check';
import { render, screen, cleanup } from '@testing-library/react';
import ToolPanel from '@/app/components/overlay/ToolPanel';
import type { ActiveTool, ToolName } from '@/lib/types';
import { TOOL_CONFIGS } from '@/lib/types';
import { useAppStore } from '@/lib/store';

// Ensure cleanup after each test and reset store
afterEach(() => {
  cleanup();
  // Reset store to initial state
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
 * **Feature: hud-tool-panel, Property 6: Empty Tools Hides Panel**
 * **Validates: Requirements 2.4**
 * 
 * For any state where activeTools array is empty, the ToolPanel component 
 * SHALL not render (return null or equivalent).
 */
describe('Property 6: Empty Tools Hides Panel', () => {
  it('should return null when tools array is empty', () => {
    fc.assert(
      fc.property(fc.constant([]), (emptyTools: ActiveTool[]) => {
        cleanup();
        // Set store state to empty tools
        useAppStore.setState({ activeTools: emptyTools });
        
        const { container } = render(
          <ToolPanel />
        );
        
        // The component should render nothing (null)
        expect(container.firstChild).toBeNull();
        expect(screen.queryByTestId('tool-panel')).not.toBeInTheDocument();
      }),
      { numRuns: 1 }
    );
  });

  it('should render panel when tools array is non-empty', () => {
    fc.assert(
      fc.property(nonEmptyUniqueToolsArb, (tools) => {
        cleanup();
        // Set store state with the generated tools
        useAppStore.setState({ activeTools: tools });
        
        const { unmount } = render(
          <ToolPanel />
        );
        
        // The panel should be rendered
        expect(screen.getByTestId('tool-panel')).toBeInTheDocument();
        
        // Each tool should have a remove button rendered
        tools.forEach((tool) => {
          const removeButton = screen.getByTestId(`remove-tool-${tool.id}`);
          expect(removeButton).toBeInTheDocument();
        });
        
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
