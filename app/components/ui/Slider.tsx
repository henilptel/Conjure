'use client';

import { ChangeEvent, useId, useState, useEffect } from 'react';
import { useDebouncedCallback } from '@/lib/hooks';

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
  debounceMs = 50,
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? `slider-${generatedId}`;
  
  // Local state for immediate visual feedback
  const [localValue, setLocalValue] = useState(value);
  
  // Sync local value when prop changes externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  // Debounced callback for actual state updates
  const debouncedOnChange = useDebouncedCallback(onChange, debounceMs);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(event.target.value);
    setLocalValue(newValue);        // Immediate visual update
    debouncedOnChange(newValue);    // Debounced callback
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
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
            ? 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed'
            : 'bg-zinc-200 dark:bg-zinc-700 accent-zinc-900 dark:accent-zinc-100'
        }`}
      />
    </div>
  );
}
