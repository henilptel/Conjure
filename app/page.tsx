'use client';

import ImageProcessor from './components/ImageProcessor';
import DynamicDock from './components/dock/DynamicDock';
import { useCompareMode } from '@/lib/hooks';

/**
 * Main page component - Immersive full-screen layout with layered z-index
 * Layer 1 (z-0): ImageProcessor canvas (full viewport)
 * Layer 2 (z-10): Floating logo/header
 * Layer 3 (z-40): DynamicDock floating at bottom center
 * 
 * Requirements: 7.1, 7.2, 7.3 - ChatInterface removed, ImageProcessor full viewport
 * Requirements: 6.1, 6.2 - Compare mode wired via useCompareMode hook
 */
export default function Home() {
  // Wire compare mode keyboard handler (Requirements: 6.1, 6.2)
  useCompareMode();

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-transparent">
      {/* Layer 1: ImageProcessor as base layer - full viewport (Requirement 7.2) */}
      <div className="absolute inset-0 z-0">
        <ImageProcessor />
      </div>

      {/* Layer 2: Floating logo/header */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 z-10">
        <h1 className="text-xl md:text-2xl font-semibold text-zinc-100 tracking-tight">
          Conjure
        </h1>
      </div>

      {/* Layer 3: DynamicDock floating at bottom center (Requirement 7.3) */}
      {/* Note: DynamicDock handles its own positioning and visibility based on image state */}
      <DynamicDock />
    </div>
  );
}
