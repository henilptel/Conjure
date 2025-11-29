'use client';

import { ChangeEvent, useId } from 'react';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export default function Slider({
  value,
  min,
  max,
  onChange,
  label,
  disabled = false,
  id,
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? `slider-${generatedId}`;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}: {value}
      </label>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        value={value}
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
