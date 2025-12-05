'use client';

import { ChangeEvent, useId, useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { useDebouncedCallback } from '@/lib/hooks';

/** Default debounce delay in milliseconds for slider onChange callbacks */
export const DEFAULT_DEBOUNCE_MS = 50;

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Called when user releases the slider (pointer up/leave). Used for final processing. */
  onCommit?: (value: number) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  debounceMs?: number; // Configurable debounce delay, default 50ms
  /** Default value for reset on double-click */
  defaultValue?: number;
  /** Optional formatter for display value (e.g., "100%" or "45°") */
  formatValue?: (value: number) => string;
}

/**
 * Slider component with debounced onChange for performance optimization.
 * Uses local state for immediate visual feedback while debouncing the callback.
 * 
 * The slider tracks whether the user is actively dragging to prevent the prop
 * sync from "jumping" the slider handle back to a stale value during interaction.
 * 
 * Performance Optimization:
 * - onChange: Called frequently during drag (debounced) - use for CSS preview updates
 * - onCommit: Called once when user releases slider - use for final WASM processing
 * 
 * Requirements: 1.1, 1.2, 1.3, slider-performance 3.1, 3.2, performance-fixes 5.1-5.4
 */
export default function Slider({
  value,
  min,
  max,
  onChange,
  onCommit,
  label,
  disabled = false,
  id,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  defaultValue,
  formatValue,
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? `slider-${generatedId}`;
  
  // Local state for immediate visual feedback
  const [localValue, setLocalValue] = useState(value);
  
  // State for inline numeric editing
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Track whether user is actively dragging using both state and ref
  // State: controls prop synchronization blocking
  // Ref: provides stable reference for callbacks to avoid stale-closure bugs
  // Requirements: 5.3, 5.4
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  
  // Track the last committed value to avoid duplicate commits
  const lastCommittedValueRef = useRef(value);
  
  // Debounced callback for preview updates during drag
  const debouncedOnChange = useDebouncedCallback(onChange, debounceMs);
  
  // Sync local value when prop changes externally (only when not dragging)
  // This allows external updates (e.g., AI tool calls) to update the slider
  // while preventing feedback loops during user interaction
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
      lastCommittedValueRef.current = value;
    }
  }, [value, isDragging]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(event.target.value);
    isDraggingRef.current = true;
    setIsDragging(true);
    setLocalValue(newValue);           // Immediate visual update
    debouncedOnChange(newValue);       // Debounced callback for preview
  };
  
  // Handle pointer/mouse up to mark end of drag interaction and commit final value
  // Uses ref instead of state in deps to avoid stale-closure bugs
  // Requirements: 5.1, 5.2, 5.3, 5.4
  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    
    const currentValue = localValue;
    
    // Cancel any pending debounced calls to avoid race conditions
    debouncedOnChange.cancel();
    
    // Always call onChange with the final value to ensure state is in sync
    onChange(currentValue);
    
    // Call onCommit for final processing (e.g., WASM in worker)
    // Only if value has actually changed from last commit
    if (onCommit && currentValue !== lastCommittedValueRef.current) {
      lastCommittedValueRef.current = currentValue;
      onCommit(currentValue);
    }
    
    // Update both ref and state - ref for callback logic, state for prop sync
    isDraggingRef.current = false;
    setIsDragging(false);
  }, [localValue, debouncedOnChange, onChange, onCommit]);

  /**
   * Handle double-click to reset slider to default value
   * Requirements: UX enhancement for quick reset
   */
  const handleDoubleClick = useCallback(() => {
    if (disabled || defaultValue === undefined) return;
    
    // Update local state immediately
    setLocalValue(defaultValue);
    
    // Notify parent of the change
    onChange(defaultValue);
    
    // Commit the reset value
    if (onCommit && defaultValue !== lastCommittedValueRef.current) {
      lastCommittedValueRef.current = defaultValue;
      onCommit(defaultValue);
    }
  }, [disabled, defaultValue, onChange, onCommit]);

  /**
   * Handle click on value label to enter edit mode
   */
  const handleValueClick = useCallback(() => {
    if (disabled) return;
    setInputValue(String(localValue));
    setIsEditing(true);
  }, [disabled, localValue]);

  /**
   * Commit the edited value and exit edit mode
   */
  const commitEditedValue = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      // Clamp value to min/max range
      const clamped = Math.max(min, Math.min(max, Math.round(parsed)));
      setLocalValue(clamped);
      onChange(clamped);
      if (onCommit && clamped !== lastCommittedValueRef.current) {
        lastCommittedValueRef.current = clamped;
        onCommit(clamped);
      }
    }
    setIsEditing(false);
  }, [inputValue, min, max, onChange, onCommit]);

  /**
   * Handle keyboard events in the edit input
   */
  const handleInputKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEditedValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  }, [commitEditedValue]);

  /**
   * Focus input when entering edit mode
   */
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Format the display value
  const displayValue = formatValue ? formatValue(localValue) : String(localValue);

  return (
    <div className="flex flex-col gap-2 w-full">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-zinc-300 flex items-center gap-1"
      >
        <span>{label}:</span>
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitEditedValue}
            onKeyDown={handleInputKeyDown}
            min={min}
            max={max}
            step={1}
            className="w-16 px-1.5 py-0.5 bg-white/5 border border-white/20 rounded 
                       text-white text-sm text-center
                       focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/20
                       [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={`Edit ${label} value`}
          />
        ) : (
          <span
            onClick={handleValueClick}
            className="cursor-pointer hover:text-white transition-colors select-none"
            title="Double Click to edit value"
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                handleValueClick();
              }
            }}
          >
            {displayValue}
          </span>
        )}
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
        onDoubleClick={handleDoubleClick}
        disabled={disabled}
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
          disabled
            ? 'bg-zinc-700 cursor-not-allowed'
            : 'bg-zinc-700 accent-zinc-100'
        }`}
        title={defaultValue !== undefined ? 'Double-click to reset' : undefined}
      />
    </div>
  );
}
