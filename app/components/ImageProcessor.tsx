'use client';

import { useState, useRef, ChangeEvent, useLayoutEffect, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, RotateCcw } from 'lucide-react';
import { validateImageFile, FileValidationResult } from '@/lib/validation';
import { initializeMagick, ImageEngine, ImageData } from '@/lib/magick';
import { renderImageToCanvas } from '@/lib/canvas';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import LoadingIndicator from './LoadingIndicator';
import NodeGraph from './NodeGraph';

type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

interface ImageProcessorState {
  status: ProcessingStatus;
  error: string | null;
  hasImage: boolean;
}

interface DragState {
  isDragging: boolean;
  position: { x: number; y: number };
  dragStart: { x: number; y: number };
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
  
  // Subscribe to nodes and edges for graph-based processing (Requirements: 5.2, 5.4)
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const getOrderedTools = useAppStore((state) => state.getOrderedTools);
  
  // Subscribe to actions separately (these are stable references)
  const { setImageState, setProcessingStatus, resetTools, initializeGraph } = useAppStore(
    useShallow((state) => ({
      setImageState: state.setImageState,
      setProcessingStatus: state.setProcessingStatus,
      resetTools: state.resetTools,
      initializeGraph: state.initializeGraph,
    }))
  );
  
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
  
  // Drag state for canvas positioning
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    position: { x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
  });
  
  // Operation counter for race condition prevention
  const pipelineOperationRef = useRef(0);

  // Render image to canvas when imageData changes
  useLayoutEffect(() => {
    if (imageData && canvasRef.current) {
      renderImageToCanvas(
        canvasRef.current,
        imageData.pixels,
        imageData.width,
        imageData.height
      );
    }
  }, [imageData]);

  // Drag handlers for canvas movement
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    setDragState(prev => ({
      ...prev,
      isDragging: true,
      dragStart: {
        x: clientX - prev.position.x,
        y: clientY - prev.position.y,
      },
    }));
  }, []);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    setDragState(prev => {
      if (!prev.isDragging) return prev;
      return {
        ...prev,
        position: {
          x: clientX - prev.dragStart.x,
          y: clientY - prev.dragStart.y,
        },
      };
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState(prev => ({
      ...prev,
      isDragging: false,
    }));
  }, []);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  }, [handleDragStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  }, [handleDragMove]);

  const handleMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Touch event handlers for mobile support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  }, [handleDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Global mouse/touch listeners for drag continuation outside canvas
  useEffect(() => {
    if (!dragState.isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    const handleGlobalMouseUp = () => {
      handleDragEnd();
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
    };

    const handleGlobalTouchEnd = () => {
      handleDragEnd();
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove);
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [dragState.isDragging, handleDragMove, handleDragEnd]);

  // Reset position when a new image is loaded
  useEffect(() => {
    if (state.hasImage) {
      setDragState(prev => ({
        ...prev,
        position: { x: 0, y: 0 },
      }));
    }
  }, [state.hasImage]);


  // Unified effect pipeline - handles graph-based processing via ImageEngine
  // When nodes/edges change, compute ordered tools and process through the engine
  // (Requirements: 5.2, 5.4)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.hasImage()) return;

    // Increment operation counter to invalidate any in-flight operations
    const operationId = ++pipelineOperationRef.current;

    // Get ordered tools from graph traversal (Requirements: 5.1, 5.2)
    const orderedTools = getOrderedTools();

    // If orderedTools is non-empty, use the ImageEngine for processing
    // Reduced debounce from 300ms to 50ms since input is now debounced at Slider level
    // (slider-performance Requirements: 4.3)
    if (orderedTools.length > 0) {
      const timeoutId = setTimeout(async () => {
        if (pipelineOperationRef.current !== operationId) return;
        if (!engineRef.current?.hasImage()) return;

        setState(prev => ({ ...prev, error: null, status: 'processing' }));
        setProcessingStatus('processing');

        try {
          const processedData = await engineRef.current.process(orderedTools);
          
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

    // No orderedTools - show original image
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
  }, [nodes, edges, getOrderedTools, setProcessingStatus]);


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
      
      // Initialize the node graph with Source and Output nodes
      initializeGraph();
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
        engineRef.current.dispose();
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
      {/* z-0 ensures canvas remains visible beneath NodeGraph overlay */}
      {state.hasImage && (
        <div 
          className="absolute inset-0 z-0 flex items-center justify-center p-8 overflow-hidden"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            className={cn(
              "max-w-full max-h-full",
              dragState.isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
            style={{
              transform: `translate(${dragState.position.x}px, ${dragState.position.y}px)`,
              transition: dragState.isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            data-testid="image-canvas"
          />
        </div>
      )}

      {/* NodeGraph - fullscreen overlay for node-based effect pipeline (Requirements: 1.1, 1.2) */}
      {/* z-10 ensures NodeGraph floats above the canvas */}
      {state.hasImage && (
        <div className="absolute inset-0 z-10">
          <NodeGraph disabled={isProcessing} />
        </div>
      )}

      {/* Reset Button - positioned at bottom left */}
      {state.hasImage && nodes.length > 0 && (
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
