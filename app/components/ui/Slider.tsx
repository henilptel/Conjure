'use client';

import { ChangeEvent, useId, useState, useEffect } from 'react';
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
 * Requirements: 1.1, 1.2, 1.3
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
  
  // Debounced callback for actual state updates
  const debouncedOnChange = useDebouncedCallback(onChange, debounceMs);
  
  // Sync local value when prop changes externally and cancel pending debounced callbacks
  // This effect only runs when the value prop actually changes
  useEffect(() => {
    setLocalValue(value);
    // Cancel any pending debounced callback to avoid stale updates overwriting external changes
    debouncedOnChange.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(event.target.value);
    setLocalValue(newValue);           // Immediate visual update
    debouncedOnChange.call(newValue);  // Debounced callback
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
