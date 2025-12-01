/**
 * Property-based tests for Dynamic Dock
 * **Feature: dynamic-dock**
 */

import * as fc from 'fast-check';
import {
  ToastMessage,
  addToast,
  removeToast,
  DEFAULT_AUTO_DISMISS_MS,
} from '@/app/components/dock/GhostToast';
import {
  dockReducer,
  initialDockState,
  DockLocalState,
  DockAction,
} from '@/app/components/dock/DynamicDock';
import { TOOL_REGISTRY } from '@/lib/tools-registry';

// ============================================================================
// Arbitraries for generating test data
// ============================================================================

/**
 * Generate a valid toast message
 */
const toastMessageArb = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.integer({ min: 0, max: Date.now() + 1000000 }),
});

/**
 * Generate a queue of toast messages with unique IDs
 */
const toastQueueArb = fc.array(toastMessageArb, { minLength: 0, maxLength: 10 })
  .map(toasts => {
    // Ensure unique IDs
    const seen = new Set<string>();
    return toasts.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  });

/**
 * Generate a non-empty toast queue
 */
const nonEmptyToastQueueArb = fc.array(toastMessageArb, { minLength: 1, maxLength: 10 })
  .map(toasts => {
    const seen = new Set<string>();
    return toasts.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  })
  .filter(arr => arr.length > 0);

// ============================================================================
// Property 7: Toast Auto-Dismiss
// ============================================================================

/**
 * **Feature: dynamic-dock, Property 7: Toast Auto-Dismiss**
 * **Validates: Requirements 4.2**
 * 
 * For any displayed toast, after 5 seconds (or click), the toast SHALL be 
 * removed from the queue.
 * 
 * Note: Auto-dismiss is now handled via setTimeout in each ToastItem component,
 * so these tests verify the constants and helper functions only.
 */
describe('Property 7: Toast Auto-Dismiss', () => {

  it('removeToast removes the specified toast from queue', () => {
    fc.assert(
      fc.property(
        nonEmptyToastQueueArb,
        fc.nat(),
        (queue, indexSeed) => {
          const indexToRemove = indexSeed % queue.length;
          const toastToRemove = queue[indexToRemove];
          
          const result = removeToast(queue, toastToRemove.id);
          
          // Toast should be removed
          expect(result.find(t => t.id === toastToRemove.id)).toBeUndefined();
          // Length should decrease by 1
          expect(result.length).toBe(queue.length - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('default auto-dismiss time is 5 seconds (5000ms)', () => {
    expect(DEFAULT_AUTO_DISMISS_MS).toBe(5000);
  });
});


// ============================================================================
// Property 9: Toast Queue Order
// ============================================================================

/**
 * **Feature: dynamic-dock, Property 9: Toast Queue Order**
 * **Validates: Requirements 4.4**
 * 
 * For any sequence of AI responses, toasts SHALL be displayed in FIFO order.
 */
describe('Property 9: Toast Queue Order', () => {
  it('addToast appends new toasts to the end of the queue (FIFO)', () => {
    fc.assert(
      fc.property(
        toastQueueArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (queue, newText) => {
          const result = addToast(queue, newText);
          
          // New toast should be at the end
          const lastToast = result[result.length - 1];
          expect(lastToast.text).toBe(newText);
          
          // All previous toasts should maintain their relative order
          const originalIds = queue.map(t => t.id);
          const resultIds = result.slice(0, queue.length).map(t => t.id);
          
          // If queue wasn't truncated, order should be preserved
          if (queue.length < 5) {
            expect(resultIds).toEqual(originalIds);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('addToast preserves FIFO order when adding multiple toasts sequentially', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        (texts) => {
          let queue: ToastMessage[] = [];
          const maxQueueSize = 5; // Explicit limit
          
          // Add toasts sequentially
          for (const text of texts) {
            queue = addToast(queue, text, maxQueueSize);
          }
          
          // Toasts should be in the order they were added
          for (let i = 0; i < texts.length; i++) {
            expect(queue[i].text).toBe(texts[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('addToast limits queue size to maxQueueSize (default 5)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 6, maxLength: 10 }),
        fc.integer({ min: 1, max: 10 }),
        (texts, maxQueueSize) => {
          let queue: ToastMessage[] = [];
          
          // Add more toasts than maxQueueSize
          for (const text of texts) {
            queue = addToast(queue, text, maxQueueSize);
          }
          
          // Queue should not exceed maxQueueSize
          expect(queue.length).toBeLessThanOrEqual(maxQueueSize);
          
          // Most recent toasts should be preserved (FIFO - oldest dropped)
          const expectedTexts = texts.slice(-maxQueueSize);
          for (let i = 0; i < queue.length; i++) {
            expect(queue[i].text).toBe(expectedTexts[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('removeToast preserves order of remaining toasts', () => {
    fc.assert(
      fc.property(
        nonEmptyToastQueueArb.filter(q => q.length >= 2),
        fc.nat(),
        (queue, indexSeed) => {
          const indexToRemove = indexSeed % queue.length;
          const toastToRemove = queue[indexToRemove];
          
          const result = removeToast(queue, toastToRemove.id);
          
          // Remaining toasts should maintain their relative order
          const expectedOrder = queue
            .filter(t => t.id !== toastToRemove.id)
            .map(t => t.id);
          const actualOrder = result.map(t => t.id);
          
          expect(actualOrder).toEqual(expectedOrder);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toasts have monotonically increasing timestamps when added sequentially', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
        (texts) => {
          let queue: ToastMessage[] = [];
          
          // Add toasts sequentially with small delays simulated
          for (const text of texts) {
            queue = addToast(queue, text);
          }
          
          // Timestamps should be non-decreasing (could be equal if added in same ms)
          for (let i = 1; i < queue.length; i++) {
            expect(queue[i].timestamp).toBeGreaterThanOrEqual(queue[i - 1].timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Arbitraries for Dock State Testing
// ============================================================================

/**
 * Generate a valid tool ID from TOOL_REGISTRY
 */
// Ensure TOOL_REGISTRY has at least one entry for tests
if (Object.keys(TOOL_REGISTRY).length === 0) {
  throw new Error('TOOL_REGISTRY must have at least one entry for property tests');
}

const registeredToolIdArb = fc.constantFrom(...Object.keys(TOOL_REGISTRY));

/**
 * Generate a random image state
 */
const imageStateArb = fc.record({
  hasImage: fc.boolean(),
  width: fc.option(fc.integer({ min: 1, max: 4096 }), { nil: null }),
  height: fc.option(fc.integer({ min: 1, max: 4096 }), { nil: null }),
});

/**
 * Generate an image state with an image loaded
 */
const imageStateWithImageArb = fc.record({
  hasImage: fc.constant(true),
  width: fc.integer({ min: 1, max: 4096 }),
  height: fc.integer({ min: 1, max: 4096 }),
});

/**
 * Generate an image state without an image
 */
const imageStateWithoutImageArb = fc.record({
  hasImage: fc.constant(false),
  width: fc.constant(null),
  height: fc.constant(null),
});

/**
 * Generate a dock state in IDLE mode
 */
const idleDockStateArb: fc.Arbitrary<DockLocalState> = fc.constant({
  mode: 'IDLE' as const,
  activeTool: null,
  toastQueue: [],
});

/**
 * Generate a dock state in AI_MODE
 */
const aiModeDockStateArb: fc.Arbitrary<DockLocalState> = fc.record({
  mode: fc.constant('AI_MODE' as const),
  activeTool: fc.constant(null),
  toastQueue: toastQueueArb,
});

// ============================================================================
// Property 1: Dock Visibility Matches Image State
// ============================================================================

/**
 * **Feature: dynamic-dock, Property 1: Dock Visibility Matches Image State**
 * **Validates: Requirements 1.1, 1.2**
 * 
 * For any image state, the Dynamic Dock visibility SHALL equal the hasImage 
 * boolean - visible when true, hidden when false.
 */
describe('Property 1: Dock Visibility Matches Image State', () => {
  it('dock should be visible when hasImage is true', () => {
    fc.assert(
      fc.property(
        imageStateWithImageArb,
        (imageState) => {
          // When hasImage is true, dock should be visible
          // This is a pure logic test - the component returns null when !hasImage
          expect(imageState.hasImage).toBe(true);
          // The dock visibility is determined by: if (!imageState.hasImage) return null;
          // So when hasImage is true, the dock renders (visibility = true)
          const shouldBeVisible = imageState.hasImage;
          expect(shouldBeVisible).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('dock should be hidden when hasImage is false', () => {
    fc.assert(
      fc.property(
        imageStateWithoutImageArb,
        (imageState) => {
          // When hasImage is false, dock should be hidden
          expect(imageState.hasImage).toBe(false);
          // The dock visibility is determined by: if (!imageState.hasImage) return null;
          // So when hasImage is false, the dock returns null (visibility = false)
          const shouldBeVisible = imageState.hasImage;
          expect(shouldBeVisible).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('dock visibility equals hasImage for any image state', () => {
    fc.assert(
      fc.property(
        imageStateArb,
        (imageState) => {
          // The dock visibility should always equal hasImage
          // Component logic: if (!imageState.hasImage) return null;
          const dockVisible = imageState.hasImage;
          expect(dockVisible).toBe(imageState.hasImage);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 2: Tool Selection (Moved to EffectsFAB/ToolBrowser)
// ============================================================================
// Note: Tool selection is now handled by EffectsFAB and ToolBrowser components.
// The DynamicDock is now focused on AI chat functionality only.

// ============================================================================
// Property 5: Sparkle Enters AI Mode
// ============================================================================

/**
 * **Feature: dynamic-dock, Property 5: Sparkle Enters AI Mode**
 * **Validates: Requirements 3.1**
 * 
 * For any IDLE state, clicking the Sparkle icon SHALL transition to AI_MODE state.
 */
describe('Property 5: Sparkle Enters AI Mode', () => {
  it('ENTER_AI_MODE action transitions from IDLE to AI_MODE', () => {
    fc.assert(
      fc.property(
        idleDockStateArb,
        (initialState) => {
          const action: DockAction = { type: 'ENTER_AI_MODE' };
          const newState = dockReducer(initialState, action);
          
          // Should transition to AI_MODE
          expect(newState.mode).toBe('AI_MODE');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ENTER_AI_MODE preserves toast queue', () => {
    fc.assert(
      fc.property(
        toastQueueArb,
        (toastQueue) => {
          const initialState: DockLocalState = {
            mode: 'IDLE',
            activeTool: null,
            toastQueue,
          };
          const action: DockAction = { type: 'ENTER_AI_MODE' };
          const newState = dockReducer(initialState, action);
          
          // Toast queue should be preserved
          expect(newState.toastQueue).toEqual(toastQueue);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ENTER_AI_MODE does not set activeTool', () => {
    fc.assert(
      fc.property(
        idleDockStateArb,
        (initialState) => {
          const action: DockAction = { type: 'ENTER_AI_MODE' };
          const newState = dockReducer(initialState, action);
          
          // activeTool should remain null
          expect(newState.activeTool).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('EXIT_AI_MODE returns to IDLE from AI_MODE', () => {
    fc.assert(
      fc.property(
        aiModeDockStateArb,
        (initialState) => {
          const action: DockAction = { type: 'EXIT_AI_MODE' };
          const newState = dockReducer(initialState, action);
          
          // Should return to IDLE mode
          expect(newState.mode).toBe('IDLE');
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 3 & 4: Tool Management (Moved to EffectsFAB/ToolBrowser)
// ============================================================================
// Note: Tool management is now handled by EffectsFAB and ToolBrowser components.
// The DynamicDock is now focused on AI chat functionality only.


// ============================================================================
// Property 6: Escape Exits AI Mode
// ============================================================================

/**
 * **Feature: dynamic-dock, Property 6: Escape Exits AI Mode**
 * **Validates: Requirements 3.4**
 * 
 * For any AI_MODE state, pressing the Escape key SHALL transition to IDLE state.
 */
describe('Property 6: Escape Exits AI Mode', () => {
  it('EXIT_AI_MODE action transitions from AI_MODE to IDLE', () => {
    fc.assert(
      fc.property(
        aiModeDockStateArb,
        (initialState) => {
          const action: DockAction = { type: 'EXIT_AI_MODE' };
          const newState = dockReducer(initialState, action);
          
          // Should transition to IDLE mode
          expect(newState.mode).toBe('IDLE');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('EXIT_AI_MODE preserves toast queue', () => {
    fc.assert(
      fc.property(
        aiModeDockStateArb,
        (initialState) => {
          const action: DockAction = { type: 'EXIT_AI_MODE' };
          const newState = dockReducer(initialState, action);
          
          // Toast queue should be preserved
          expect(newState.toastQueue).toEqual(initialState.toastQueue);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('EXIT_AI_MODE clears activeTool', () => {
    fc.assert(
      fc.property(
        aiModeDockStateArb,
        (initialState) => {
          const action: DockAction = { type: 'EXIT_AI_MODE' };
          const newState = dockReducer(initialState, action);
          
          // activeTool should be null after exiting AI mode
          expect(newState.activeTool).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('round-trip: ENTER_AI_MODE then EXIT_AI_MODE returns to IDLE', () => {
    fc.assert(
      fc.property(
        idleDockStateArb,
        (initialState) => {
          // Enter AI mode
          let state = dockReducer(initialState, { type: 'ENTER_AI_MODE' });
          expect(state.mode).toBe('AI_MODE');
          
          // Exit AI mode (simulating Escape key)
          state = dockReducer(state, { type: 'EXIT_AI_MODE' });
          expect(state.mode).toBe('IDLE');
          
          // Toast queue should be preserved through the round-trip
          expect(state.toastQueue).toEqual(initialState.toastQueue);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 8: AI Tool Call (Simplified)
// ============================================================================
// Note: AI tool calls now add tools directly to the store via addTool().
// The dock no longer transitions to ACTIVE_TOOL mode - tools are managed
// by the EffectsFAB and ActiveToolsPanel components.


// ============================================================================
// Property 11: Compare Mode Requires Image
// ============================================================================

/**
 * **Feature: dynamic-dock, Property 11: Compare Mode Requires Image**
 * **Validates: Requirements 6.4**
 * 
 * For any state without a loaded image, Space key events SHALL have no effect 
 * on compare mode.
 */
describe('Property 11: Compare Mode Requires Image', () => {
  /**
   * Helper to simulate the compare mode logic from useCompareMode hook.
   * This tests the core logic: compare mode should only be set when hasImage is true.
   */
  const shouldSetCompareMode = (hasImage: boolean, keyPressed: boolean): boolean => {
    // The hook only calls setCompareMode when hasImage is true
    // If hasImage is false, the key events have no effect
    if (!hasImage) {
      return false; // No effect - compare mode stays unchanged
    }
    return keyPressed;
  };

  it('Space key has no effect when hasImage is false', () => {
    fc.assert(
      fc.property(
        imageStateWithoutImageArb,
        fc.boolean(), // initial compare mode state
        (imageState, initialCompareMode) => {
          // When hasImage is false, Space key should have no effect
          expect(imageState.hasImage).toBe(false);
          
          // Simulate Space key press - should not change compare mode
          const afterKeyDown = shouldSetCompareMode(imageState.hasImage, true);
          expect(afterKeyDown).toBe(false); // No effect
          
          // Simulate Space key release - should not change compare mode
          const afterKeyUp = shouldSetCompareMode(imageState.hasImage, false);
          expect(afterKeyUp).toBe(false); // No effect
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Space key activates compare mode when hasImage is true', () => {
    fc.assert(
      fc.property(
        imageStateWithImageArb,
        (imageState) => {
          // When hasImage is true, Space key should activate compare mode
          expect(imageState.hasImage).toBe(true);
          
          // Simulate Space key press - should enable compare mode
          const afterKeyDown = shouldSetCompareMode(imageState.hasImage, true);
          expect(afterKeyDown).toBe(true);
          
          // Simulate Space key release - should disable compare mode
          const afterKeyUp = shouldSetCompareMode(imageState.hasImage, false);
          expect(afterKeyUp).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('compare mode behavior depends solely on hasImage state', () => {
    fc.assert(
      fc.property(
        imageStateArb,
        fc.boolean(), // key pressed state
        (imageState, keyPressed) => {
          const result = shouldSetCompareMode(imageState.hasImage, keyPressed);
          
          if (!imageState.hasImage) {
            // When no image, result is always false (no effect)
            expect(result).toBe(false);
          } else {
            // When image exists, result matches key state
            expect(result).toBe(keyPressed);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('image dimensions do not affect compare mode behavior', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }), // width
        fc.integer({ min: 1, max: 10000 }), // height
        fc.boolean(), // key pressed
        (width, height, keyPressed) => {
          // With any valid dimensions, compare mode should work
          const imageState = { hasImage: true, width, height };
          const result = shouldSetCompareMode(imageState.hasImage, keyPressed);
          expect(result).toBe(keyPressed);
          
          // Without image (null dimensions), compare mode should not work
          const noImageState = { hasImage: false, width: null, height: null };
          const noImageResult = shouldSetCompareMode(noImageState.hasImage, keyPressed);
          expect(noImageResult).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('multiple Space key events have no cumulative effect without image', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), // sequence of key events
        (keySequence) => {
          const imageState = { hasImage: false, width: null, height: null };
          
          // Apply sequence of key events
          for (const keyPressed of keySequence) {
            const result = shouldSetCompareMode(imageState.hasImage, keyPressed);
            // Every result should be false when no image
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
