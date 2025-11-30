'use client';

import { useState, useRef, ChangeEvent, useLayoutEffect, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, RotateCcw, Eye } from 'lucide-react';
import { validateImageFile, FileValidationResult } from '@/lib/validation';
import { initializeMagick, ImageEngine, ImageData } from '@/lib/magick';
import { renderImageToCanvas, createCanvasRenderCache, CanvasRenderCache } from '@/lib/canvas';
import { useAppStore } from '@/lib/store';
import { useCompareMode } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import LoadingIndicator from './LoadingIndicator';

type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

interface ImageProcessorState {
  status: ProcessingStatus;
  error: string | null;
  hasImage: boolean;
}

// Drop Zone animation variants (Framer Motion) - Requirements: 3.1, 3.2
const dropZoneVariants = {
  initial: { scale: 1, opacity: 0.6 },
  animate: { 
    scale: [1, 1.02, 1],
    opacity: [0.6, 0.8, 0.6],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const }
  }
};

/**
 * ImageProcessor component - uses Zustand store for state management
 * and ImageEngine for optimized image processing.
 * 
 * Uses selective Zustand subscriptions to prevent unnecessary re-renders.
 * 
 * Requirements: 1.6, 1.7, 3.4, 3.5, 3.6, slider-performance 3.1, 3.2
 */
export default function ImageProcessor() {
  // Selective subscriptions to Zustand store to prevent unnecessary re-renders
  // (slider-performance Requirements: 3.1, 3.2)
  
  // Subscribe only to activeTools for the processing effect
  const activeTools = useAppStore((state) => state.activeTools);
  
  // Subscribe to compare mode state (Requirements: 6.1, 6.2, 6.3)
  const isCompareMode = useAppStore((state) => state.isCompareMode);
  
  // Subscribe to actions separately (these are stable references)
  const { setImageState, setProcessingStatus, resetTools } = useAppStore(
    useShallow((state) => ({
      setImageState: state.setImageState,
      setProcessingStatus: state.setProcessingStatus,
      resetTools: state.resetTools,
    }))
  );
  
  // Initialize compare mode keyboard handler (Requirements: 6.1, 6.2, 6.4)
  useCompareMode();
  
  const [state, setState] = useState<ImageProcessorState>({
    status: 'idle',
    error: null,
    hasImage: false,
  });
  
  // ImageEngine instance for optimized processing (Requirements: 3.4)
  const engineRef = useRef<ImageEngine | null>(null);
  
  // imageData: the displayed image (processed with effects)
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Cached canvas rendering resources for performance optimization
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const canvasRenderCacheRef = useRef<CanvasRenderCache>(createCanvasRenderCache());
  
  // Operation counter for race condition prevention
  const pipelineOperationRef = useRef(0);

  // Render image to canvas when imageData changes (with cached resources)
  useLayoutEffect(() => {
    if (imageData && canvasRef.current) {
      // Get or cache the canvas context
      if (!canvasCtxRef.current) {
        canvasCtxRef.current = canvasRef.current.getContext('2d');
      }
      
      if (canvasCtxRef.current) {
        renderImageToCanvas(
          canvasCtxRef.current,
          canvasRef.current,
          imageData.pixels,
          imageData.width,
          imageData.height,
          canvasRenderCacheRef.current
        );
      }
    }
  }, [imageData]);


  // Unified effect pipeline - handles activeTools processing via ImageEngine
  // When activeTools change, process through the engine (Requirements: 3.6)
  // When isCompareMode is true, display original image (Requirements: 6.1, 6.2)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.hasImage()) return;

    // Increment operation counter to invalidate any in-flight operations
    const operationId = ++pipelineOperationRef.current;

    // When compare mode is active, show original image (Requirements: 6.1, 6.2)
    if (isCompareMode) {
      const timeoutId = setTimeout(async () => {
        if (pipelineOperationRef.current !== operationId) return;
        if (!engineRef.current?.hasImage()) return;
        
        try {
          const originalData = await engineRef.current.process([]);
          if (pipelineOperationRef.current === operationId) {
            setImageData({ ...originalData });
            setState(prev => ({ ...prev, status: 'complete' }));
            setProcessingStatus('complete');
          }
        } catch {
          // Ignore errors for original display
        }
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }

    // If activeTools is non-empty, use the ImageEngine for processing
    // Reduced debounce from 300ms to 50ms since input is now debounced at Slider level
    // (slider-performance Requirements: 4.3)
    if (activeTools.length > 0) {
      const timeoutId = setTimeout(async () => {
        if (pipelineOperationRef.current !== operationId) return;
        if (!engineRef.current?.hasImage()) return;

        setState(prev => ({ ...prev, error: null, status: 'processing' }));
        setProcessingStatus('processing');

        try {
          const processedData = await engineRef.current.process(activeTools);
          
          if (pipelineOperationRef.current === operationId) {
            setImageData({ ...processedData });
            setState(prev => ({ ...prev, status: 'complete' }));
            setProcessingStatus('complete');
          }
        } catch (err) {
          if (pipelineOperationRef.current === operationId) {
            const errorMessage = err instanceof Error 
              ? err.message 
              : 'Failed to apply effects. Please try again.';
            setState(prev => ({ ...prev, error: errorMessage, status: 'error' }));
            setProcessingStatus('error');
          }
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }

    // No activeTools - show original image
    const timeoutId = setTimeout(async () => {
      if (pipelineOperationRef.current !== operationId) return;
      if (!engineRef.current?.hasImage()) return;
      
      try {
        const originalData = await engineRef.current.process([]);
        if (pipelineOperationRef.current === operationId) {
          setImageData({ ...originalData });
          setState(prev => ({ ...prev, status: 'complete' }));
          setProcessingStatus('complete');
        }
      } catch {
        // Ignore errors for original display
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [activeTools, isCompareMode, setProcessingStatus]);


  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      return;
    }

    // Validate the file
    const validationResult: FileValidationResult = validateImageFile(file);
    
    if (!validationResult.isValid) {
      setState(prev => ({
        ...prev,
        error: validationResult.error || 'Invalid file',
        hasImage: false,
        status: 'error',
      }));
      setProcessingStatus('error');
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Clear any previous errors and start initialization
    setState(prev => ({
      ...prev,
      error: null,
      status: 'initializing',
    }));
    setProcessingStatus('initializing');

    try {
      // Initialize Magick.WASM
      await initializeMagick();
      
      setState(prev => ({
        ...prev,
        status: 'processing',
      }));
      setProcessingStatus('processing');

      // Read the file into memory
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Create ImageEngine instance if not exists (Requirements: 3.4)
      if (!engineRef.current) {
        engineRef.current = new ImageEngine();
      }
      
      // Load image using ImageEngine - decodes once (Requirements: 3.5)
      const data = await engineRef.current.loadImage(uint8Array);
      setImageData(data);
      
      setState(prev => ({
        ...prev,
        hasImage: true,
        status: 'complete',
      }));
      setProcessingStatus('complete');

      // Update Zustand store with new image state
      setImageState({
        hasImage: true,
        width: data.width,
        height: data.height,
      });
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to process the image. Please try again.';
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        status: 'error',
      }));
      setProcessingStatus('error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        // Use async dispose for thread-safe cleanup
        // Fire-and-forget since we're unmounting
        engineRef.current.disposeAsync();
        engineRef.current = null;
      }
    };
  }, []);

  const isProcessing = state.status === 'initializing' || state.status === 'processing';


  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center">
      {/* Error Display - positioned at top center */}
      <AnimatePresence>
        {state.error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-10 p-4 bg-red-900/40 backdrop-blur-md border border-red-500/30 rounded-xl"
          >
            <p className="text-sm text-red-400">{state.error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Indicator - centered overlay */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          >
            <LoadingIndicator 
              message={state.status === 'initializing' ? 'Initializing image processor...' : 'Processing image...'}
              size="md"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated Drop Zone - shown when no image (Requirements: 3.1, 3.2) */}
      {!state.hasImage && (
        <motion.label
          htmlFor="image-upload"
          variants={dropZoneVariants}
          initial="initial"
          animate="animate"
          className={cn(
            "flex flex-col items-center justify-center",
            "w-[90vw] h-[60vw] max-w-[400px] max-h-[300px]",
            "border-2 border-dashed border-white/20 rounded-2xl",
            "bg-white/5 backdrop-blur-sm",
            "cursor-pointer transition-colors",
            "hover:border-white/40 hover:bg-white/10",
            isProcessing && "cursor-not-allowed opacity-50"
          )}
          data-testid="drop-zone"
        >
          <Upload className="w-10 h-10 md:w-12 md:h-12 mb-3 md:mb-4 text-zinc-400" />
          <p className="mb-2 text-base md:text-lg text-zinc-300 text-center px-4">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs md:text-sm text-zinc-500">
            PNG, JPEG, GIF, or WebP
          </p>
          <input
            ref={fileInputRef}
            id="image-upload"
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleFileSelect}
            disabled={isProcessing}
          />
        </motion.label>
      )}

      {/* Canvas for Image Display - centered, floating appearance (Requirements: 3.3, 3.4) */}
      {state.hasImage && (
        <div className="flex items-center justify-center h-full w-full p-8">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full"
            data-testid="image-canvas"
          />
        </div>
      )}

      {/* Compare Mode Indicator - shown when Space is held (Requirements: 6.3) */}
      <AnimatePresence>
        {isCompareMode && state.hasImage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full"
            data-testid="compare-mode-indicator"
          >
            <Eye className="w-4 h-4 text-white/80" />
            <span className="text-sm text-white/80 font-medium">Comparing</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note: Tool controls handled by ActiveToolsPanel and EffectsFAB */}

      {/* Reset Button - positioned at bottom left */}
      {state.hasImage && activeTools.length > 0 && (
        <button
          onClick={resetTools}
          disabled={isProcessing}
          className={cn(
            "absolute bottom-4 left-4 md:bottom-6 md:left-6",
            "flex items-center gap-2 px-3 py-2 rounded-xl",
            "backdrop-blur-md border border-white/10 text-sm",
            isProcessing
              ? "bg-black/20 text-zinc-500 cursor-not-allowed"
              : "bg-black/40 text-zinc-200 hover:bg-black/60 transition-colors cursor-pointer"
          )}
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      )}
    </div>
  );
}
