'use client';

import ImageProcessor from './components/ImageProcessor';
import DynamicDock from './components/dock/DynamicDock';
import ActiveToolsPanel from './components/dock/ActiveToolsPanel';
import EffectsFAB from './components/dock/EffectsFAB';
import { useCompareMode } from '@/lib/hooks';
import { useAppStore } from '@/lib/store';

/**
 * Main page component - Immersive full-screen layout with layered z-index
 * Layer 1 (z-0): ImageProcessor canvas (full viewport)
 * Layer 2 (z-10): Floating logo/header
 * Layer 3 (z-30): ActiveToolsPanel on left, EffectsFAB on right
 * Layer 4 (z-40): DynamicDock floating AI input at bottom center
 * 
 * Requirements: 7.1, 7.2, 7.3 - Centralized chat via ChatContext
 * Requirements: 6.1, 6.2 - Compare mode wired via useCompareMode hook
 */
export default function Home() {
  // Wire compare mode keyboard handler (Requirements: 6.1, 6.2)
  useCompareMode();
  
  const hasImage = useAppStore((state) => state.imageState.hasImage);

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-transparent">
      {/* Layer 1: ImageProcessor as base layer - full viewport (Requirement 7.2) */}
      <div className="absolute inset-0 z-0">
        <ImageProcessor />
      </div>

      {/* Layer 2: Floating logo/header */}
      <div className="absolute top-6 left-6 md:top-8 md:left-8 z-10 select-none mix-blend-difference flex items-center gap-3">
        <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-syne)] font-bold text-white/90">
          Conjure
        </h1>
        <span className="px-2.5 py-0.5 rounded-full border border-white/20 bg-white/5 text-[10px] md:text-xs font-medium tracking-wider text-white/70 uppercase font-sans backdrop-blur-sm mt-1">
          Preview
        </span>
      </div>

      {/* Layer 3: ActiveToolsPanel - shows active effects on left side */}
      {hasImage && <ActiveToolsPanel />}
      
      {/* Layer 3: EffectsFAB - floating action button on right side */}
      <EffectsFAB />

      {/* Layer 4: DynamicDock - floating AI input at bottom center */}
      <DynamicDock />
    </div>
  );
}
