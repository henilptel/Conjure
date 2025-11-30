/**
 * Custom React hooks for MagickFlow
 */
import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from './store';

/**
 * Hook for compare mode keyboard handling
 * Listens for Space key press/release to toggle compare mode
 * Only activates when an image is loaded
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
      
      // Check for Space key
      if (event.code === 'Space') {
        // Prevent default scrolling behavior
        event.preventDefault();
        // Enable compare mode (Requirement 6.1)
        setCompareMode(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Only activate when image is loaded (Requirement 6.4)
      if (!hasImage) return;
      
      // Check for Space key
      if (event.code === 'Space') {
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
 */
export interface DebouncedCallback<T extends (...args: any[]) => void> {
  /** The debounced function to call */
  call: (...args: Parameters<T>) => void;
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

  const call = useCallback(
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
  );

  return { call, cancel };
}
