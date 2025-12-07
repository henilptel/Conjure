'use client';

import { useCallback } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import Slider from '../ui/Slider';
import { useAppStore } from '@/lib/store';
import { getToolConfig } from '@/lib/tools-registry';
import { glass, iconSize } from '@/lib/design-tokens';

export interface ToolPanelProps {
  disabled?: boolean;
}

/**
 * Entry animation variants for the ToolPanel
 * Slide-up and fade-in on mount, slide-down and fade-out on exit
 * Requirements: 5.2
 */
const toolPanelVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 }
};

/**
 * Creates a format function for slider display based on tool ID
 */
const createSliderFormatter = (toolId: string) => (value: number): string => {
  if (toolId === 'rotate') return `${value}°`;
  if (['brightness', 'saturation', 'hue'].includes(toolId)) return `${value}%`;
  return String(value);
};

/**
 * A glassmorphism-styled floating panel that renders tool sliders.
 * Positioned at bottom-center of the parent container.
 * Returns null when tools array is empty.
 * 
 * Uses Zustand store for state management with shallow equality selector
 * to prevent unnecessary re-renders.
 * 
 * Requirements: 1.6, 1.7, 5.1, 5.2, 5.3, undo-redo 3.3
 */
export default function ToolPanel({
  disabled = false,
}: ToolPanelProps) {
  // Get state and actions from Zustand store with shallow equality
  const { 
    activeTools, 
    updateToolValue,
    removeTool,
    commitPreview,
    startPreview,
  } = useAppStore(
    useShallow((state) => ({
      activeTools: state.activeTools,
      updateToolValue: state.updateToolValue,
      removeTool: state.removeTool,
      commitPreview: state.commitPreview,
      startPreview: state.startPreview,
    }))
  );

  // Handle slider change - directly updates tool value for WASM processing
  const handleSliderChange = useCallback((toolId: string, value: number) => {
    // Start preview mode if not already started (for history tracking)
    startPreview(toolId);
    updateToolValue(toolId, value);
  }, [updateToolValue, startPreview]);

  // Handle slider commit - records history when slider is released
  // Requirements: undo-redo 3.3
  const handleSliderCommit = useCallback((toolId: string, value: number) => {
    commitPreview(toolId, value);
  }, [commitPreview]);
  
  // Use AnimatePresence to handle exit animations (Requirement 5.2)
  return (
    <AnimatePresence>
      {activeTools.length > 0 && (
        <motion.div
          variants={toolPanelVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`absolute bottom-4 md:bottom-10 left-1/2 -translate-x-1/2 z-10 
                     ${glass.blur} ${glass.background} ${glass.border} rounded-2xl
                     p-3 md:p-4 min-w-[240px] md:min-w-[280px] max-w-[90vw] md:max-w-[400px]`}
          style={{ boxShadow: glass.boxShadow }}
          data-testid="tool-panel"
        >
          <div className="flex flex-col gap-4">
            {activeTools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <Slider
                    id={`tool-slider-${tool.id}`}
                    label={tool.label}
                    value={tool.value}
                    min={tool.min}
                    max={tool.max}
                    onChange={(value) => handleSliderChange(tool.id, value)}
                    onCommit={(value) => handleSliderCommit(tool.id, value)}
                    disabled={disabled}
                    defaultValue={getToolConfig(tool.id)?.defaultValue}
                    formatValue={createSliderFormatter(tool.id)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeTool(tool.id)}
                  className={`p-1 rounded-full transition-colors ${
                    disabled 
                      ? 'text-zinc-500 cursor-not-allowed' 
                      : 'hover:bg-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                  aria-label={`Remove ${tool.label} tool`}
                  data-testid={`remove-tool-${tool.id}`}
                  disabled={disabled}
                >
                  <X size={iconSize.md} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
