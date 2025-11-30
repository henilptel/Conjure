'use client';

import { ChangeEvent, useId, useState, useEffect, useRef } from 'react';
import { useDebouncedCallback } from '@/lib/hooks';

/** Default debounce delay in milliseconds for slider onChange callbacks */
export const DEFAULT_DEBOUNCE_MS = 50;

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  debounceMs?: number; // Configurable debounce delay, default 50ms
}

/**
 * Slider component with debounced onChange for performance optimization.
 * Uses local state for immediate visual feedback while debouncing the callback.
 * 
 * The slider tracks whether the user is actively dragging to prevent the prop
 * sync from "jumping" the slider handle back to a stale value during interaction.
 * 
 * Requirements: 1.1, 1.2, 1.3, slider-performance 3.1, 3.2
 */
export default function Slider({
  value,
  min,
  max,
  onChange,
  label,
  disabled = false,
  id,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? `slider-${generatedId}`;
  
  // Local state for immediate visual feedback
  const [localValue, setLocalValue] = useState(value);
  
  // Track whether user is actively dragging to prevent prop sync during interaction
  const isDraggingRef = useRef(false);
  
  // Debounced callback for actual state updates
  const debouncedOnChange = useDebouncedCallback(onChange, debounceMs);
  
  // Sync local value when prop changes externally (only when not dragging)
  // This allows external updates (e.g., AI tool calls) to update the slider
  // while preventing feedback loops during user interaction
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(event.target.value);
    isDraggingRef.current = true;
    setLocalValue(newValue);           // Immediate visual update
    debouncedOnChange(newValue);       // Debounced callback
  };
  
  // Handle pointer/mouse up to mark end of drag interaction
  const handlePointerUp = () => {
    // Use a small timeout to allow the final debounced callback to fire
    // before we allow prop sync again
    setTimeout(() => {
      isDraggingRef.current = false;
    }, debounceMs + 10);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-zinc-300"
      >
        {label}: {localValue}
      </label>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        value={localValue}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={disabled}
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
          disabled
            ? 'bg-zinc-700 cursor-not-allowed'
            : 'bg-zinc-700 accent-zinc-100'
        }`}
      />
    </div>
  );
}
