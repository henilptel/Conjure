/**
 * Custom React hooks for MagickFlow
 */
import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from './store';

/**
 * Check if the active element is an input that should receive keyboard events
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  // Check for input, textarea, select, or contenteditable elements
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    activeElement.getAttribute('contenteditable') === 'true'
  );
}

/**
 * Hook for compare mode keyboard handling
 * Listens for Space key press/release to toggle compare mode
 * Only activates when an image is loaded and no input is focused
 * 
 * Requirements: 6.1, 6.2, 6.4
 */
export function useCompareMode(): void {
  const hasImage = useAppStore((state) => state.imageState.hasImage);
  const setCompareMode = useAppStore((state) => state.setCompareMode);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only activate when image is loaded (Requirement 6.4)
      if (!hasImage) return;
      
      // Don't trigger compare mode when typing in an input
      if (isInputFocused()) return;
      
      // Check for Space key
      if (event.code === 'Space') {
        // Prevent default scrolling behavior
        event.preventDefault();
        // Enable compare mode (Requirement 6.1)
        setCompareMode(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Check for Space key
      if (event.code === 'Space') {
        // Always disable compare mode on Space release to prevent stuck state
        // Disable compare mode (Requirement 6.2)
        setCompareMode(false);
      }
    };

    // Add global keyboard listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hasImage, setCompareMode]);
}

/**
 * Return type for useDebouncedCallback hook
 * A callable debounced function with an attached cancel method
 */
export type DebouncedCallback<T extends (...args: any[]) => void> = {
  (...args: Parameters<T>): void;
  /** Cancel any pending debounced invocation */
  cancel: () => void;
}

/**
 * Creates a debounced version of a callback function.
 * The callback will only be invoked after the specified delay has passed
 * since the last invocation.
 * 
 * @param callback - The function to debounce
 * @param delay - Delay in milliseconds (default: 50ms)
 * @returns Object with debounced callback and cancel method
 * 
 * Requirements: 1.1, 1.2
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 50
): DebouncedCallback<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Use default 50ms if delay is invalid
      const effectiveDelay = !isFinite(delay) || delay < 0 ? 50 : delay;

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, effectiveDelay);
    },
    [delay]
  ) as DebouncedCallback<T>;

  // Attach cancel method to the function
  debouncedFn.cancel = cancel;

  return debouncedFn;
}


/**
 * Hook for undo/redo keyboard shortcuts
 * Listens for Ctrl+Z (undo) and Ctrl+Shift+Z (redo)
 * Respects platform conventions (Cmd on macOS)
 * Only activates when an image is loaded and no input is focused
 * 
 * Requirements: 1.1, 2.1
 */
export function useUndoRedoKeyboard(): void {
  const hasImage = useAppStore((state) => state.imageState.hasImage);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const canUndo = useAppStore((state) => state.canUndo);
  const canRedo = useAppStore((state) => state.canRedo);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only activate when image is loaded
      if (!hasImage) return;
      
      // Don't trigger when typing in an input field
      if (isInputFocused()) return;
      
      // Check for Ctrl+Z or Cmd+Z (undo) and Ctrl+Shift+Z or Cmd+Shift+Z (redo)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;
      
      if (!modifierKey) return;
      
      // Check for Z key
      if (event.key.toLowerCase() === 'z') {
        if (event.shiftKey) {
          // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
          if (canRedo()) {
            event.preventDefault();
            redo();
          }
        } else {
          // Undo: Ctrl+Z or Cmd+Z
          if (canUndo()) {
            event.preventDefault();
            undo();
          }
        }
      }
    };

    // Add global keyboard listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasImage, undo, redo, canUndo, canRedo]);
}
