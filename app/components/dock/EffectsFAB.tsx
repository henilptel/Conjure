'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sliders } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { glassSubtle, iconSize, magneticButton } from '@/lib/design-tokens';
import ToolBrowser from './ToolBrowser';

export interface EffectsFABProps {
  disabled?: boolean;
}

/**
 * EffectsFAB - Simple button that opens the effects sidebar
 */
export default function EffectsFAB({ disabled = false }: EffectsFABProps) {
  const activeTools = useAppStore((state) => state.activeTools);
  const hasImage = useAppStore((state) => state.imageState.hasImage);
  
  const [isToolBrowserOpen, setIsToolBrowserOpen] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled) return;
    setIsToolBrowserOpen(true);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsToolBrowserOpen(false);
  }, []);

  if (!hasImage) return null;

  const activeCount = activeTools.length;

  return (
    <>
      <motion.button
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={magneticButton.whileHover}
        whileTap={magneticButton.whileTap}
        transition={magneticButton.transition}
        onClick={handleClick}
        disabled={disabled}
        className={`fixed right-6 top-1/2 -translate-y-1/2 z-30
                   w-12 h-12 rounded-full
                   ${glassSubtle.background} ${glassSubtle.blur} ${glassSubtle.border}
                   flex items-center justify-center
                   hover:bg-zinc-800/70 hover:border-white/30
                   disabled:opacity-50 disabled:cursor-not-allowed`}
        style={{ boxShadow: glassSubtle.boxShadow }}
        aria-label="Open effects panel"
        data-testid="effects-fab"
      >
        <Sliders size={iconSize.xl} className="text-zinc-300" />
        
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full
                           bg-white text-black text-xs font-medium
                           flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </motion.button>

      <ToolBrowser
        isOpen={isToolBrowserOpen}
        onClose={handleClose}
      />
    </>
  );
}
