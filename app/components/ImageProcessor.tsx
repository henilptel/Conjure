'use client';

import { useState, useRef, ChangeEvent, useLayoutEffect, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, RotateCcw, Eye, AlertTriangle, Plus, Minus } from 'lucide-react';
import { validateImageFile, FileValidationResult } from '@/lib/validation';
import { initializeMagick, ImageEngine, ImageData } from '@/lib/magick';
import { 
  renderImageToCanvas, 
  createCanvasRenderCache, 
  CanvasRenderCache, 
  clearCanvasRenderCache, 
  getCanvasRenderCacheSize,
  CanvasTransform,
  DEFAULT_TRANSFORM,
  calculateZoomTransform,
  calculatePanTransform,
  screenToCanvasCoords,
  getTouchDistance,
  getTouchCenter,
  calculatePinchTransform,
  PinchState,
} from '@/lib/canvas';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatBytes, MemoryUsageInfo } from '@/lib/memory-management';
import { getProcessingMessage } from '@/lib/processing-messages';
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
  
  // Subscribe to processing message for dynamic feedback (Requirements: 3.3)
  const processingMessage = useAppStore((state) => state.processingMessage);
  
  // Subscribe to actions separately (these are stable references)
  const { setImageState, setProcessingStatus, setProcessingMessage, resetTools } = useAppStore(
    useShallow((state) => ({
      setImageState: state.setImageState,
      setProcessingStatus: state.setProcessingStatus,
      setProcessingMessage: state.setProcessingMessage,
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
  
  // Separate storage for original and processed data (Requirements: 2.1)
  // originalData: the initially loaded image (never modified by effects)
  const [originalData, setOriginalData] = useState<ImageData | null>(null);
  // processedData: the image with effects applied
  const [processedData, setProcessedData] = useState<ImageData | null>(null);
  
  // displayData: derived from compare mode - instant swap without WASM (Requirements: 2.2, 2.3, 2.4)
  const displayData = isCompareMode ? originalData : processedData;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Cached canvas rendering resources for performance optimization
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const canvasRenderCacheRef = useRef<CanvasRenderCache>(createCanvasRenderCache());
  
  // Canvas transform state for zoom/pan (Requirements: 1.1, 1.2, 1.4)
  const [transform, setTransform] = useState<CanvasTransform>(DEFAULT_TRANSFORM);
  
  // Pan tracking state and refs for mouse drag operations
  const [isPanning, setIsPanning] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const lastPanPositionRef = useRef({ x: 0, y: 0 });
  
  // Container ref for accurate coordinate calculations
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Touch gesture state for pinch-to-zoom
  const pinchStateRef = useRef<PinchState | null>(null);
  
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

  /**
   * Handle mouse wheel for zoom (Requirements: 1.2, 1.3)
   * Zooms centered on cursor position, using correct coordinate conversion
   */
  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const containerRect = container.getBoundingClientRect();
    
    // Convert screen coordinates to canvas-relative coordinates
    // This properly accounts for CSS transforms on the canvas
    setTransform(prev => {
      const canvasCoords = screenToCanvasCoords(
        event.clientX,
        event.clientY,
        containerRect,
        canvas.width,
        canvas.height,
        prev
      );
      
      // Positive deltaY = scroll down = zoom out, negative = zoom in
      const delta = event.deltaY < 0 ? 1 : -1;
      
      return calculateZoomTransform(
        prev,
        delta,
        canvasCoords.x,
        canvasCoords.y,
        canvas.width,
        canvas.height
      );
    });
  }, []);

  /**
   * Handle mouse down for pan initiation (Requirements: 1.4)
   * Starts panning on:
   * - Regular left-click drag when zoomed (scale !== 1)
   * - Alt+left click drag at any zoom level
   * - Middle mouse button drag at any zoom level
   */
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Middle mouse button always initiates pan
    if (event.button === 1) {
      event.preventDefault();
      setIsPanning(true);
      lastPanPositionRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    
    // Left click: pan if Alt is held OR if zoomed (in or out)
    if (event.button === 0 && (event.altKey || transform.scale !== 1)) {
      event.preventDefault();
      setIsPanning(true);
      lastPanPositionRef.current = { x: event.clientX, y: event.clientY };
    }
  }, [transform.scale]);

  /**
   * Handle mouse move for panning (Requirements: 1.4)
   */
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    
    const deltaX = event.clientX - lastPanPositionRef.current.x;
    const deltaY = event.clientY - lastPanPositionRef.current.y;
    
    lastPanPositionRef.current = { x: event.clientX, y: event.clientY };
    
    setTransform(prev => calculatePanTransform(prev, deltaX, deltaY));
  }, [isPanning]);

  /**
   * Handle mouse up to end panning (Requirements: 1.4)
   */
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  /**
   * Handle mouse leave to end panning if cursor leaves canvas
   */
  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  /**
   * Handle touch start for pinch-to-zoom and two-finger pan
   */
  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    if (event.touches.length === 2) {
      // Two-finger gesture: pinch-to-zoom or pan
      event.preventDefault();
      
      const touch1 = { x: event.touches[0].clientX, y: event.touches[0].clientY, id: event.touches[0].identifier };
      const touch2 = { x: event.touches[1].clientX, y: event.touches[1].clientY, id: event.touches[1].identifier };
      
      const distance = getTouchDistance(touch1, touch2);
      const center = getTouchCenter(touch1, touch2);
      
      pinchStateRef.current = {
        initialDistance: distance,
        initialCenter: center,
        initialScale: transform.scale,
        initialTransform: { ...transform },
      };
    } else if (event.touches.length === 1 && transform.scale !== 1) {
      // Single finger drag when scale is not 1 - allow panning
      event.preventDefault();
      setIsPanning(true);
      lastPanPositionRef.current = { 
        x: event.touches[0].clientX, 
        y: event.touches[0].clientY 
      };
    }
  }, [transform]);

  /**
   * Handle touch move for pinch-to-zoom and two-finger pan
   */
  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    if (event.touches.length === 2 && pinchStateRef.current) {
      // Two-finger gesture: pinch-to-zoom
      event.preventDefault();
      
      const touch1 = { x: event.touches[0].clientX, y: event.touches[0].clientY, id: event.touches[0].identifier };
      const touch2 = { x: event.touches[1].clientX, y: event.touches[1].clientY, id: event.touches[1].identifier };
      
      const currentDistance = getTouchDistance(touch1, touch2);
      const currentCenter = getTouchCenter(touch1, touch2);
      const containerRect = container.getBoundingClientRect();
      
      const newTransform = calculatePinchTransform(
        pinchStateRef.current,
        currentDistance,
        currentCenter,
        containerRect,
        canvas.width,
        canvas.height
      );
      
      setTransform(newTransform);
    } else if (event.touches.length === 1 && isPanning) {
      // Single finger panning when zoomed in
      event.preventDefault();
      
      const deltaX = event.touches[0].clientX - lastPanPositionRef.current.x;
      const deltaY = event.touches[0].clientY - lastPanPositionRef.current.y;
      
      lastPanPositionRef.current = { 
        x: event.touches[0].clientX, 
        y: event.touches[0].clientY 
      };
      
      setTransform(prev => calculatePanTransform(prev, deltaX, deltaY));
    }
  }, [isPanning]);

  /**
   * Handle touch end to reset gesture state
   */
  const handleTouchEnd = useCallback(() => {
    pinchStateRef.current = null;
    setIsPanning(false);
  }, []);

  /**
   * Keyboard shortcuts for zoom/pan (Requirements: 1.5, 1.6, 1.7)
   * + key: zoom in toward center
   * - key: zoom out from center
   * 0 key: reset to fit-to-screen
   * Also tracks Alt key state for cursor feedback
   */
  useEffect(() => {
    if (!state.hasImage) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Track Alt key for cursor feedback
      if (event.key === 'Alt') {
        setIsAltPressed(true);
      }
      
      // Ignore if user is typing in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      // Calculate canvas center for keyboard zoom
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      switch (event.key) {
        case '+':
        case '=': // Allow = key without shift for convenience
          event.preventDefault();
          setTransform(prev => calculateZoomTransform(
            prev,
            1, // zoom in
            centerX,
            centerY,
            canvas.width,
            canvas.height
          ));
          break;
          
        case '-':
        case '_': // Allow _ key (shift+-) for consistency
          event.preventDefault();
          setTransform(prev => calculateZoomTransform(
            prev,
            -1, // zoom out
            centerX,
            centerY,
            canvas.width,
            canvas.height
          ));
          break;
          
        case '0':
          event.preventDefault();
          // Reset to default transform (fit-to-screen)
          setTransform(DEFAULT_TRANSFORM);
          break;
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setIsAltPressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [state.hasImage]);

  // Reset transform when image changes to prevent carrying over zoom/pan from previous image
  useEffect(() => {
    if (processedData) {
      setTransform(DEFAULT_TRANSFORM);
    }
  }, [processedData]);

  // Render image to canvas when displayData changes (with cached resources)
  // displayData is derived from isCompareMode - instant swap without WASM (Requirements: 2.2, 2.3, 2.4)
  // Transform is applied via CSS, not canvas context
  // (Requirements: 1.1 - transform application via CSS)
  useLayoutEffect(() => {
    if (displayData && canvasRef.current) {
      // Always get fresh context from current canvas element with null check
      // This ensures we never use a stale context from an unmounted canvas
      const ctx = canvasCtxRef.current ?? canvasRef.current.getContext('2d');
      
      if (ctx) {
        // Update cache if we got a fresh context
        if (!canvasCtxRef.current) {
          canvasCtxRef.current = ctx;
        }
        
        // Render without transform - CSS handles zoom/pan
        renderImageToCanvas(
          ctx,
          canvasRef.current,
          displayData.pixels,
          displayData.width,
          displayData.height,
          canvasRenderCacheRef.current
        );
        
        // Report canvas render cache size to ImageEngine for memory tracking
        if (engineRef.current) {
          const cacheSize = getCanvasRenderCacheSize(canvasRenderCacheRef.current);
          engineRef.current.setCanvasRenderCacheSize(cacheSize);
        }
      }
    }
  }, [displayData]);



  // Track the activeTools that were used to generate current processedData
  // This allows us to skip re-processing when exiting compare mode if tools haven't changed
  const lastProcessedToolsRef = useRef<string>('');
  
  // Unified effect pipeline - processes activeTools and stores in processedData
  // Compare mode is handled by displayData derivation - no WASM invocation needed
  // (Requirements: 2.2, 2.3, 2.4, 3.6)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.hasImage()) return;
    
    // Skip processing when in compare mode - displayData handles the swap instantly
    // (Requirements: 2.2, 2.3, 2.4)
    if (isCompareMode) return;
    
    // Create a fingerprint of current tools to detect changes
    const toolsFingerprint = JSON.stringify(activeTools.map(t => ({ id: t.id, value: t.value })));
    
    // Skip processing if tools haven't changed since last processing
    // This prevents re-processing when exiting compare mode
    if (toolsFingerprint === lastProcessedToolsRef.current) return;

    // Increment operation counter to invalidate any in-flight operations
    const operationId = ++pipelineOperationRef.current;
    
    // Only show processing indicator when actually applying effects
    const isApplyingEffects = activeTools.length > 0;
    
    // Determine the processing message based on the active tools
    // Shows specific message for single tool, count for multiple tools
    const determineProcessingMessage = (): string => {
      if (activeTools.length === 0) return '';
      if (activeTools.length === 1) {
        return getProcessingMessage(activeTools[0].id);
      }
      // For multiple tools, show count
      return `Applying ${activeTools.length} effects...`;
    };

    const timeoutId = setTimeout(async () => {
      if (pipelineOperationRef.current !== operationId) return;
      if (!engineRef.current?.hasImage()) return;

      if (isApplyingEffects) {
        setState(prev => ({ ...prev, error: null, status: 'processing' }));
        setProcessingStatus('processing');
        setProcessingMessage(determineProcessingMessage());
      }

      try {
        const startTime = performance.now();
        
        // Process with current tools - ImageEngine handles empty arrays correctly
        const result = engineRef.current.isWorkerReady() && isApplyingEffects
          ? await engineRef.current.processInWorker(activeTools)
          : await engineRef.current.process(activeTools);
        
        const endTime = performance.now();
        
        if (pipelineOperationRef.current === operationId) {
          setProcessedData({ ...result });
          // Update the fingerprint to mark these tools as processed
          lastProcessedToolsRef.current = toolsFingerprint;
          setLastProcessingTime(endTime - startTime);
          setState(prev => ({ ...prev, status: 'complete' }));
          setProcessingStatus('complete');
          setProcessingMessage('');
        }
      } catch (err) {
        if (pipelineOperationRef.current === operationId) {
          const errorMessage = err instanceof Error 
            ? err.message 
            : 'Failed to apply effects. Please try again.';
          setState(prev => ({ ...prev, error: errorMessage, status: 'error' }));
          setProcessingStatus('error');
          setProcessingMessage('');
        }
      }
    }, isApplyingEffects ? 50 : 0); // Slight delay only when processing effects

    return () => clearTimeout(timeoutId);
  }, [activeTools, isCompareMode, setProcessingStatus, setProcessingMessage]);


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
      // Store both original and processed data (Requirements: 2.1)
      // originalData: never modified, used for instant compare
      // processedData: will be updated when effects are applied
      setOriginalData({ ...data });
      setProcessedData({ ...data });
      // Reset the tools fingerprint so processing triggers when tools are applied
      lastProcessedToolsRef.current = '';
      
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
    // Capture ref values at effect setup time
    const engine = engineRef.current;
    const cache = canvasRenderCacheRef.current;
    
    return () => {
      if (engine) {
        // Use async dispose for thread-safe cleanup
        // Fire-and-forget since we're unmounting
        engine.disposeAsync();
      }
      // Clear canvas render cache to free memory
      clearCanvasRenderCache(cache);
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
              {state.status === 'initializing' 
                ? 'Initializing...' 
                : (processingMessage || 'Processing...')}
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
      {/* Zoom/Pan support via CSS transforms (Requirements: 1.1, 1.2, 1.4) */}
      {state.hasImage && (
        <div 
          ref={containerRef}
          className="relative flex items-center justify-center h-full w-full p-8 overflow-hidden"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => e.preventDefault()}
          style={{ 
            cursor: isPanning 
              ? 'grabbing' 
              : transform.scale !== 1 
                ? 'grab'  // When zoomed (in or out), show grab cursor (can pan by dragging)
                : isAltPressed 
                  ? 'grab'  // When Alt is held, show grab cursor
                  : 'default',
            touchAction: 'none', // Disable browser touch gestures
          }}
        >
          <canvas
            ref={canvasCallbackRef}
            className="shadow-2xl rounded-sm"
            data-testid="image-canvas"
            style={{ 
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: 'center center',
            }}
          />
          
          {/* Zoom Controls - Apple-style glassmorphism matching other UI elements */}
          <div 
            className="absolute bottom-4 right-4 flex items-center
                       bg-white/10 backdrop-blur-2xl backdrop-saturate-150
                       border border-white/20 
                       rounded-full shadow-lg shadow-black/10
                       select-none"
            data-testid="zoom-controls"
          >
            {/* Zoom Out Button */}
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                setTransform(prev => calculateZoomTransform(
                  prev, -1, centerX, centerY, canvas.width, canvas.height
                ));
              }}
              className="p-2 hover:bg-white/10 rounded-full transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={transform.scale <= 0.1}
              aria-label="Zoom out"
            >
              <Minus className="w-4 h-4 text-white/90" />
            </button>
            
            {/* Zoom Percentage - clickable to reset */}
            <button
              onClick={() => setTransform(DEFAULT_TRANSFORM)}
              className="px-1 min-w-[3rem] text-center text-xs font-medium text-white/90
                         hover:bg-white/10 transition-colors"
              title="Click to reset zoom (or press 0)"
              aria-label="Reset zoom"
            >
              {Math.round(transform.scale * 100)}%
            </button>
            
            {/* Zoom In Button */}
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                setTransform(prev => calculateZoomTransform(
                  prev, 1, centerX, centerY, canvas.width, canvas.height
                ));
              }}
              className="p-2 hover:bg-white/10 rounded-full transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={transform.scale >= 5}
              aria-label="Zoom in"
            >
              <Plus className="w-4 h-4 text-white/90" />
            </button>
          </div>
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
