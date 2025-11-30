'use client';

import { useState, useCallback } from 'react';
import ImageProcessor from './components/ImageProcessor';
import ChatInterface from './components/ChatInterface';
import { 
  ImageState, 
  defaultImageState, 
  ActiveTool, 
  ToolInput,
  addToolsWithValues, 
  updateToolValue, 
  removeTool 
} from '@/lib/types';

export default function Home() {
  const [imageState, setImageState] = useState<ImageState>(defaultImageState);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);

  const handleStateChange = useCallback((newState: ImageState) => {
    setImageState(newState);
  }, []);

  // Handle tool call from AI - adds new tools with initial values
  // Requirements: 1.1
  const handleToolCall = useCallback((toolInputs: ToolInput[]) => {
    setActiveTools(prev => addToolsWithValues(prev, toolInputs));
  }, []);

  // Handle tool value update - uses updateToolValue function with clamping
  // Requirements: 5.1
  const handleToolUpdate = useCallback((id: string, value: number) => {
    setActiveTools(prev => updateToolValue(prev, id, value));
  }, []);

  // Handle tool removal - uses removeTool function
  // Requirements: 4.2
  const handleToolRemove = useCallback((id: string) => {
    setActiveTools(prev => removeTool(prev, id));
  }, []);

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
            <ImageProcessor 
              onStateChange={handleStateChange}
              activeTools={activeTools}
              onToolUpdate={handleToolUpdate}
              onToolRemove={handleToolRemove}
            />
          </main>
          
          {/* Chat Sidebar */}
          <aside className="lg:w-96 h-[600px]">
            <ChatInterface 
              imageState={imageState}
              onToolCall={handleToolCall}
            />
          </aside>
        </div>
        
        <footer className="mt-12 text-center text-sm text-zinc-500 dark:text-zinc-500">
          <p>All image processing happens locally in your browser</p>
        </footer>
      </div>
    </div>
  );
}
