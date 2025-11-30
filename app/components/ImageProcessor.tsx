'use client';

import { useState, useRef, ChangeEvent, useLayoutEffect, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { validateImageFile, FileValidationResult } from '@/lib/validation';
import { initializeMagick, ImageEngine, ImageData } from '@/lib/magick';
import { renderImageToCanvas } from '@/lib/canvas';
import { useAppStore } from '@/lib/store';
import LoadingIndicator from './LoadingIndicator';
import Slider from './ui/Slider';
import ToolPanel from './overlay/ToolPanel';

type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

interface ImageProcessorState {
  status: ProcessingStatus;
  error: string | null;
  hasImage: boolean;
}

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
  
  // Subscribe to actions separately (these are stable references)
  const { setImageState, setProcessingStatus } = useAppStore(
    useShallow((state) => ({
      setImageState: state.setImageState,
      setProcessingStatus: state.setProcessingStatus,
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
  const [blur, setBlur] = useState(0);
  // TODO: isGrayscale tracks whether grayscale has been applied for UI feedback.
  // Future use: display indicator badge, persist state across sessions, or
  // commit grayscale to base image for permanent effect.
  const [isGrayscale, setIsGrayscale] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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


  // Unified effect pipeline - handles activeTools processing via ImageEngine
  // When activeTools change, process through the engine (Requirements: 3.6)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.hasImage()) return;

    // Increment operation counter to invalidate any in-flight operations
    const operationId = ++pipelineOperationRef.current;

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

    // No activeTools - use local blur slider if needed
    if (blur === 0) {
      // No effects to apply, show original
      const processOriginal = async () => {
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
      };
      processOriginal();
      return;
    }

    // Apply local blur when no activeTools
    // Reduced debounce from 300ms to 50ms (slider-performance Requirements: 4.3)
    const timeoutId = setTimeout(async () => {
      if (pipelineOperationRef.current !== operationId) return;
      if (!engineRef.current?.hasImage()) return;

      setState(prev => ({ ...prev, error: null, status: 'processing' }));
      setProcessingStatus('processing');

      try {
        // Create a temporary blur tool for processing
        const blurTool = { id: 'blur', label: 'Blur', value: blur, min: 0, max: 20 };
        const blurredData = await engineRef.current.process([blurTool]);
        
        if (pipelineOperationRef.current === operationId) {
          setImageData({ ...blurredData });
          setState(prev => ({ ...prev, status: 'complete' }));
          setProcessingStatus('complete');
        }
      } catch (err) {
        if (pipelineOperationRef.current === operationId) {
          const errorMessage = err instanceof Error 
            ? err.message 
            : 'Failed to apply blur effect. Please try again.';
          setState(prev => ({ ...prev, error: errorMessage, status: 'error' }));
          setProcessingStatus('error');
        }
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [blur, activeTools, setProcessingStatus]);

  // Handler for blur changes
  const handleBlurChange = useCallback((value: number) => {
    setBlur(value);
  }, []);


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
      setBlur(0); // Reset blur for new image
      setIsGrayscale(false); // Reset grayscale for new image
      
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

  const handleGrayscale = async () => {
    const engine = engineRef.current;
    if (!engine || !engine.hasImage()) {
      return;
    }

    setState(prev => ({
      ...prev,
      error: null,
      status: 'processing',
    }));
    setProcessingStatus('processing');

    try {
      // engine.process() is non-destructive: it applies effects to a copy of the
      // cached pixel data and returns new ImageData without modifying the source.
      // Note: This grayscale effect is temporary - subsequent pipeline runs with
      // different activeTools will overwrite this result. To make grayscale
      // permanent, you would need to commit the processed result back to the
      // engine's cached pixels (not currently implemented).
      const grayscaleTool = { id: 'grayscale', label: 'Grayscale', value: 100, min: 0, max: 100 };
      const grayscaleData = await engine.process([grayscaleTool]);
      
      setImageData(grayscaleData);
      setIsGrayscale(true);
      
      setState(prev => ({ ...prev, status: 'complete' }));
      setProcessingStatus('complete');
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to convert image. Please try again.';
      
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
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Image Processor
      </h2>
      
      {/* File Upload Input */}
      <div className="w-full">
        <label
          htmlFor="image-upload"
          className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-colors ${
            isProcessing
              ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 cursor-not-allowed'
              : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer'
          }`}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <svg
              className="w-8 h-8 mb-3 text-zinc-500 dark:text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              PNG, JPEG, GIF, or WebP
            </p>
          </div>
          <input
            ref={fileInputRef}
            id="image-upload"
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleFileSelect}
            disabled={isProcessing}
          />
        </label>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="w-full p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        </div>
      )}

      {/* Loading Indicator */}
      {isProcessing && (
        <LoadingIndicator 
          message={state.status === 'initializing' ? 'Initializing image processor...' : 'Processing image...'}
          size="md"
        />
      )}

      {/* Canvas for Image Display */}
      {state.hasImage && (
        <div className="w-full flex flex-col items-center gap-4">
          {/* Relative container for canvas and ToolPanel overlay */}
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="max-w-full border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm"
            />
            {/* ToolPanel overlay - positioned at bottom-center of canvas */}
            <ToolPanel disabled={isProcessing} />
          </div>
          
          {/* Grayscale Button */}
          <button
            onClick={handleGrayscale}
            disabled={isProcessing}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              isProcessing
                ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed'
                : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300'
            }`}
          >
            Make Grayscale
          </button>
          
          {/* Blur Slider - hidden when activeTools contains blur (HUD panel takes precedence) */}
          {!activeTools.some(t => t.id === 'blur') && (
            <div className="w-full max-w-xs">
              <Slider
                value={blur}
                min={0}
                max={20}
                onChange={handleBlurChange}
                label="Blur"
                disabled={isProcessing}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
