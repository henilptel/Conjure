'use client';

import { useState, useRef, ChangeEvent, useLayoutEffect, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, RotateCcw, Eye, AlertTriangle } from 'lucide-react';
import { validateImageFile, FileValidationResult } from '@/lib/validation';
import { initializeMagick, ImageEngine, ImageData } from '@/lib/magick';
import { renderImageToCanvas, createCanvasRenderCache, CanvasRenderCache, clearCanvasRenderCache, getCanvasRenderCacheSize } from '@/lib/canvas';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatBytes, MemoryUsageInfo } from '@/lib/memory-management';
import MemoryStats from './MemoryStats';

type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

interface ImageProcessorState {
  status: ProcessingStatus;
  error: string | null;
  hasImage: boolean;
  /** Warning message for non-fatal issues like downscaling */
  warning: string | null;
  /** Whether the image was downscaled for processing */
  wasDownscaled: boolean;
  /** Original dimensions before downscaling */
  originalDimensions: { width: number; height: number } | null;
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
 * Performance Optimization (slider-performance):
 * - CSS filter preview during slider drag for instant visual feedback
 * - Web Worker-based WASM processing on slider release (non-blocking)
 * - Memoized CSS filter string computation
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
  
  // Note: useCompareMode() is called in page.tsx - no need to call here
  
  const [state, setState] = useState<ImageProcessorState>({
    status: 'idle',
    error: null,
    hasImage: false,
    warning: null,
    wasDownscaled: false,
    originalDimensions: null,
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
  
  // Callback ref to detect canvas element changes and invalidate cached context
  const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
    // Store the element reference
    canvasRef.current = node;
    
    // Clear cached context when canvas element changes (mount/unmount/remount)
    // This prevents stale context references
    if (canvasCtxRef.current) {
      canvasCtxRef.current = null;
    }
    
    // If we have a new canvas element, get fresh context
    if (node) {
      canvasCtxRef.current = node.getContext('2d');
    }
  }, []);
  
  // Operation counter for race condition prevention
  const pipelineOperationRef = useRef(0);
  
  // Processing time tracking for stats panel
  const [lastProcessingTime, setLastProcessingTime] = useState(0);
  const [workerActive, setWorkerActive] = useState(false);
  
  // Callbacks for MemoryStats component
  const getEngineStats = useCallback((): MemoryUsageInfo | null => {
    if (!engineRef.current) return null;
    return engineRef.current.getDetailedMemoryUsage();
  }, []);
  
  const getImageInfo = useCallback(() => {
    if (!engineRef.current?.hasImage()) return null;
    const stats = engineRef.current.getFullStats();
    return stats.image;
  }, []);

  // Render image to canvas when imageData changes (with cached resources)
  useLayoutEffect(() => {
    if (imageData && canvasRef.current) {
      // Always get fresh context from current canvas element with null check
      // This ensures we never use a stale context from an unmounted canvas
      const ctx = canvasCtxRef.current ?? canvasRef.current.getContext('2d');
      
      if (ctx) {
        // Update cache if we got a fresh context
        if (!canvasCtxRef.current) {
          canvasCtxRef.current = ctx;
        }
        
        renderImageToCanvas(
          ctx,
          canvasRef.current,
          imageData.pixels,
          imageData.width,
          imageData.height,
          canvasRenderCacheRef.current
        );
        
        // Report canvas render cache size to ImageEngine for memory tracking
        if (engineRef.current) {
          const cacheSize = getCanvasRenderCacheSize(canvasRenderCacheRef.current);
          engineRef.current.setCanvasRenderCacheSize(cacheSize);
        }
      }
    }
  }, [imageData]);



  // Unified effect pipeline - all tools flow through activeTools
  // Compare mode shows original by processing with empty array
  // This eliminates the "hybrid state" anti-pattern - no special cases
  // (Requirements: 3.6, 6.1, 6.2)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.hasImage()) return;

    // Increment operation counter to invalidate any in-flight operations
    const operationId = ++pipelineOperationRef.current;
    
    // Determine which tools to apply:
    // - Compare mode: empty array (shows original)
    // - Normal mode: activeTools (may be empty, which also shows original)
    const toolsToApply = isCompareMode ? [] : activeTools;
    
    // Only show processing indicator when actually applying effects
    const isApplyingEffects = toolsToApply.length > 0;

    const timeoutId = setTimeout(async () => {
      if (pipelineOperationRef.current !== operationId) return;
      if (!engineRef.current?.hasImage()) return;

      if (isApplyingEffects) {
        setState(prev => ({ ...prev, error: null, status: 'processing' }));
        setProcessingStatus('processing');
      }

      try {
        const startTime = performance.now();
        
        // Single unified processing path - ImageEngine handles empty arrays correctly
        const processedData = engineRef.current.isWorkerReady() && isApplyingEffects
          ? await engineRef.current.processInWorker(toolsToApply)
          : await engineRef.current.process(toolsToApply);
        
        const endTime = performance.now();
        
        if (pipelineOperationRef.current === operationId) {
          setImageData({ ...processedData });
          setLastProcessingTime(endTime - startTime);
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
    }, isApplyingEffects ? 50 : 0); // Slight delay only when processing effects

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
        warning: null,
        wasDownscaled: false,
        originalDimensions: null,
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
      warning: null,
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
      
      // Clear any existing canvas cache to free memory before loading new image
      clearCanvasRenderCache(canvasRenderCacheRef.current);
      
      // Load image using ImageEngine - decodes once, may downscale (Requirements: 3.5)
      const data = await engineRef.current.loadImage(uint8Array);
      setImageData(data);
      
      // Check if image was downscaled
      const wasDownscaled = engineRef.current.wasDownscaled();
      const originalDims = engineRef.current.getOriginalDimensions();
      
      // Build warning message if downscaled
      let warning: string | null = null;
      if (wasDownscaled && originalDims) {
        const memUsage = engineRef.current.getMemoryUsage();
        warning = `Image (${originalDims.width}×${originalDims.height}) was downscaled to ${data.width}×${data.height} for processing. ` +
                  `Memory usage: ${formatBytes(memUsage.totalBytes)}`;
      }
      
      // Initialize Web Worker for off-thread processing (non-blocking)
      // Fire-and-forget - worker init happens in background
      engineRef.current.initializeWorker().then(() => {
        setWorkerActive(true);
      }).catch(err => {
        console.warn('Worker initialization failed, will use main thread:', err);
        setWorkerActive(false);
      });
      
      setState(prev => ({
        ...prev,
        hasImage: true,
        status: 'complete',
        warning,
        wasDownscaled,
        originalDimensions: originalDims,
      }));
      setProcessingStatus('complete');

      // Update Zustand store with new image state
      // Use processed dimensions for display, but store original for reference
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
        warning: null,
        wasDownscaled: false,
        originalDimensions: null,
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
      // Clear canvas render cache to free memory
      clearCanvasRenderCache(canvasRenderCacheRef.current);
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

      {/* Warning Display - positioned below error/loading, shows downscaling info */}
      <AnimatePresence>
        {state.warning && !isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-2 
                       bg-amber-900/30 backdrop-blur-md border border-amber-500/30 rounded-lg
                       max-w-xs"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300">{state.warning}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Indicator - top center, Apple-style glassmorphism */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-20 
                       flex items-center gap-2 px-3 py-1.5
                       bg-white/10 backdrop-blur-2xl backdrop-saturate-150
                       border border-white/20 
                       rounded-full shadow-lg shadow-black/10"
          >
            <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-white/20 border-t-white animate-spin" />
            <span className="text-xs font-medium text-white/90">
              {state.status === 'initializing' ? 'Initializing...' : 'Processing...'}
            </span>
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
            ref={canvasCallbackRef}
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
            className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 rounded-full shadow-lg shadow-black/10"
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
            "flex items-center gap-2 px-3 py-1.5 rounded-full",
            "backdrop-blur-2xl backdrop-saturate-150 border border-white/20 text-sm shadow-lg shadow-black/10",
            isProcessing
              ? "bg-white/5 text-zinc-500 cursor-not-allowed"
              : "bg-white/10 text-zinc-200 hover:bg-white/15 transition-colors cursor-pointer"
          )}
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      )}
      
      {/* Stats for Nerds - Memory diagnostics panel */}
      <MemoryStats
        getEngineStats={getEngineStats}
        getImageInfo={getImageInfo}
        lastProcessingTime={lastProcessingTime}
        isWorkerActive={workerActive}
        toggleKey="i"
      />
    </div>
  );
}
