'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { validateImageFile, FileValidationResult } from '@/lib/validation';

interface ImageProcessorState {
  isInitialized: boolean;
  isProcessing: boolean;
  error: string | null;
  hasImage: boolean;
}

export default function ImageProcessor() {
  const [state, setState] = useState<ImageProcessorState>({
    isInitialized: false,
    isProcessing: false,
    error: null,
    hasImage: false,
  });
  
  const [imageData, setImageData] = useState<ArrayBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      }));
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Clear any previous errors
    setState(prev => ({
      ...prev,
      error: null,
      isProcessing: true,
    }));

    try {
      // Read the file into memory
      const arrayBuffer = await file.arrayBuffer();
      setImageData(arrayBuffer);
      
      setState(prev => ({
        ...prev,
        hasImage: true,
        isProcessing: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: 'Failed to read the selected file. Please try again.',
        isProcessing: false,
      }));
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Image Processor
      </h2>
      
      {/* File Upload Input */}
      <div className="w-full">
        <label
          htmlFor="image-upload"
          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg cursor-pointer bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
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
            disabled={state.isProcessing}
          />
        </label>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="w-full p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        </div>
      )}

      {/* Processing Indicator */}
      {state.isProcessing && (
        <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
          <svg
            className="animate-spin h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Processing...</span>
        </div>
      )}

      {/* Image Status */}
      {state.hasImage && !state.isProcessing && (
        <div className="w-full p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-600 dark:text-green-400">
            Image loaded successfully! Ready for processing.
          </p>
        </div>
      )}
    </div>
  );
}
