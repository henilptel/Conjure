'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Undo2, Redo2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { glassSubtle, iconSize, magneticButton } from '@/lib/design-tokens';

/**
 * UndoRedoButtons - Undo and Redo button group component
 * 
 * Displays undo and redo buttons with appropriate enabled/disabled states.
 * Uses glassmorphism styling consistent with existing UI.
 * 
 * Requirements: 1.2, 2.2, 4.1, 4.2, 4.3, 4.4, 4.5
 */
export interface UndoRedoButtonsProps {
  disabled?: boolean;
}

function UndoRedoButtonsComponent({ disabled = false }: UndoRedoButtonsProps) {
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const processingStatus = useAppStore((state) => state.processingStatus);
  
  // Subscribe to history state to properly re-render when it changes
  const historyPointer = useAppStore((state) => state.history.pointer);
  const historyLength = useAppStore((state) => state.history.entries.length);

  // Disable during processing (Requirements: 4.5)
  const isProcessing = processingStatus === 'processing' || processingStatus === 'initializing';
  const isDisabled = disabled || isProcessing;

  // Check availability based on history state (Requirements: 4.1, 4.2, 4.3, 4.4)
  // canUndo: pointer > 0 (there are previous entries to undo to)
  // canRedo: pointer < entries.length - 1 (there are future entries to redo to)
  const undoDisabled = isDisabled || historyPointer <= 0;
  const redoDisabled = isDisabled || historyPointer >= historyLength - 1;

  return (
    <div
      className="flex items-center gap-1"
      data-testid="undo-redo-buttons"
      role="group"
      aria-label="Undo and redo controls"
    >
      {/* Undo button (Requirements: 1.2, 4.1, 4.2) */}
      <motion.button
        onClick={undo}
        disabled={undoDisabled}
        whileHover={!undoDisabled ? magneticButton.whileHover : undefined}
        whileTap={!undoDisabled ? magneticButton.whileTap : undefined}
        transition={magneticButton.transition}
        className={`p-2 rounded-full
                   ${glassSubtle.background} ${glassSubtle.blur} ${glassSubtle.border}
                   text-zinc-400 hover:text-white hover:bg-white/10
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400`}
        style={{ boxShadow: glassSubtle.boxShadow }}
        aria-label="Undo"
        data-testid="undo-button"
      >
        <Undo2 size={iconSize.lg} />
      </motion.button>

      {/* Redo button (Requirements: 2.2, 4.3, 4.4) */}
      <motion.button
        onClick={redo}
        disabled={redoDisabled}
        whileHover={!redoDisabled ? magneticButton.whileHover : undefined}
        whileTap={!redoDisabled ? magneticButton.whileTap : undefined}
        transition={magneticButton.transition}
        className={`p-2 rounded-full
                   ${glassSubtle.background} ${glassSubtle.blur} ${glassSubtle.border}
                   text-zinc-400 hover:text-white hover:bg-white/10
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400`}
        style={{ boxShadow: glassSubtle.boxShadow }}
        aria-label="Redo"
        data-testid="redo-button"
      >
        <Redo2 size={iconSize.lg} />
      </motion.button>
    </div>
  );
}

export default memo(UndoRedoButtonsComponent);
