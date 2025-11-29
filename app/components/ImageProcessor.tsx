'use client';

import { useState, useRef, ChangeEvent, useLayoutEffect } from 'react';
import { validateImageFile, FileValidationResult } from '@/lib/validation';
import { initializeMagick, readImageData, convertToGrayscale, ImageData } from '@/lib/magick';
import { renderImageToCanvas } from '@/lib/canvas';
import LoadingIndicator from './LoadingIndicator';

type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

interface ImageProcessorState {
  status: ProcessingStatus;
  error: string | null;
  hasImage: boolean;
}

export default function ImageProcessor() {
  const [state, setState] = useState<ImageProcessorState>({
    status: 'idle',
    error: null,
    hasImage: false,
  });
  
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render image to canvas when imageData changes - useLayoutEffect is appropriate here
  // as we're synchronizing React state with the DOM (canvas rendering)
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

    try {
      // Initialize Magick.WASM
      await initializeMagick();
      
      setState(prev => ({
        ...prev,
        status: 'processing',
      }));

      // Read the file into memory
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Read image data using Magick.WASM
      const data = await readImageData(uint8Array);
      setImageData(data);
      
      setState(prev => ({
        ...prev,
        hasImage: true,
        status: 'complete',
      }));
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to process the image. Please try again.';
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        status: 'error',
      }));
    }
  };

  const handleGrayscale = async () => {
    if (!imageData) {
      return;
    }

    setState(prev => ({
      ...prev,
      error: null,
      status: 'processing',
    }));

    try {
      const grayscaleData = await convertToGrayscale(imageData);
      setImageData(grayscaleData);
      
      setState(prev => ({
        ...prev,
        status: 'complete',
      }));
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to convert image. Please try again.';
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        status: 'error',
      }));
      // Original image is preserved since we only update imageData on success
    }
  };

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
          <canvas
            ref={canvasRef}
            className="max-w-full border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm"
          />
          
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
        </div>
      )}
    </div>
  );
}
