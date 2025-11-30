'use client';

import ImageProcessor from './components/ImageProcessor';
import ChatInterface from './components/ChatInterface';

/**
 * Main page component - Immersive full-screen layout with layered z-index
 * Layer 1 (z-0): ImageProcessor canvas
 * Layer 2 (z-10): Floating logo/header
 * Layer 3 (z-20): ChatInterface floating panel
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export default function Home() {
  return (
    <div className="h-screen w-screen overflow-hidden relative bg-transparent">
      {/* Layer 1: ImageProcessor as base layer */}
      <div className="absolute inset-0 z-0">
        <ImageProcessor />
      </div>

      {/* Layer 2: Floating logo/header */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 z-10">
        <h1 className="text-xl md:text-2xl font-semibold text-zinc-100 tracking-tight">
          Conjure
        </h1>
      </div>

      {/* Layer 3: ChatInterface as floating panel - responsive width */}
      <div className="z-20">
        <ChatInterface />
      </div>
    </div>
  );
}
