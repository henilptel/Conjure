/**
 * Custom React hooks for MagickFlow
 */
import { useRef, useCallback, useEffect } from 'react';

/**
 * Creates a debounced version of a callback function.
 * The callback will only be invoked after the specified delay has passed
 * since the last invocation.
 * 
 * @param callback - The function to debounce
 * @param delay - Delay in milliseconds (default: 50ms)
 * @returns Debounced version of the callback
 * 
 * Requirements: 1.1, 1.2
 */
export function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number = 50
): (...args: Parameters<T>) => void {
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

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Use default 50ms if delay is invalid
      const effectiveDelay = delay < 0 ? 50 : delay;

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, effectiveDelay);
    },
    [delay]
  );

  return debouncedCallback;
}
