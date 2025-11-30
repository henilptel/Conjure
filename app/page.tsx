'use client';

import ImageProcessor from './components/ImageProcessor';
import ChatInterface from './components/ChatInterface';

/**
 * Main page component - minimal orchestration with Zustand store
 * State management moved to lib/store.ts
 * Requirements: 1.6, 1.7
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 py-12 px-4">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          Magick.WASM Image Processor
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-lg">
          Client-side image processing powered by ImageMagick WebAssembly
        </p>
      </header>
      
      <div className="container mx-auto max-w-7xl">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Content - Image Processor */}
          <main className="flex-1">
            <ImageProcessor />
          </main>
          
          {/* Chat Sidebar - responsive height with viewport-relative sizing */}
          <aside className="lg:w-96 h-[50vh] min-h-[300px] max-h-[80vh] lg:h-[70vh] lg:min-h-[400px] lg:max-h-[800px] overflow-auto">
            <ChatInterface />
          </aside>
        </div>
        
        <footer className="mt-12 text-center text-sm text-zinc-500 dark:text-zinc-500">
          <p>All image processing happens locally in your browser</p>
        </footer>
      </div>
    </div>
  );
}
