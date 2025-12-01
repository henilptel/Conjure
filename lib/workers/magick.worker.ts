/**
 * Web Worker for ImageMagick WASM processing
 * 
 * Offloads expensive WASM image decoding and processing from the main thread
 * to prevent UI blocking during slider interactions.
 * 
 * Communication Protocol:
 * - Main thread sends: { type: 'init' } to initialize WASM
 * - Main thread sends: { type: 'process', sourceBytes, tools } for processing
 * - Worker responds: { type: 'init-complete' | 'init-error' | 'process-complete' | 'process-error', ... }
 */

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from '@imagemagick/magick-wasm';

import { EFFECT_ORDER, TOOL_EXECUTORS } from '../tools-definitions';

// ============================================================================
// Types
// ============================================================================

/** Active tool passed from main thread */
interface ActiveTool {
  id: string;
  value: number;
}

/** Message types from main thread to worker */
interface InitMessage {
  type: 'init';
  wasmBytes: ArrayBuffer;
}

interface ProcessMessage {
  type: 'process';
  requestId: number;
  sourceBytes: ArrayBuffer;
  tools: ActiveTool[];
}

type WorkerMessage = InitMessage | ProcessMessage;

/** Response types from worker to main thread */
interface InitCompleteResponse {
  type: 'init-complete';
}

interface InitErrorResponse {
  type: 'init-error';
  error: string;
}

interface ProcessCompleteResponse {
  type: 'process-complete';
  requestId: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
}

interface ProcessErrorResponse {
  type: 'process-error';
  requestId: number;
  error: string;
}

interface ReadyResponse {
  type: 'ready';
}

type WorkerResponse = ReadyResponse | InitCompleteResponse | InitErrorResponse | ProcessCompleteResponse | ProcessErrorResponse;

// ============================================================================
// Worker State
// ============================================================================

let isInitialized = false;

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Initialize ImageMagick WASM in the worker
 */
async function handleInit(wasmBytes: ArrayBuffer): Promise<WorkerResponse> {
  if (isInitialized) {
    return { type: 'init-complete' };
  }

  try {
    await initializeImageMagick(new Uint8Array(wasmBytes));
    isInitialized = true;
    return { type: 'init-complete' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
    return { type: 'init-error', error: errorMessage };
  }
}

/**
 * Process image with effects in the worker
 */
function handleProcess(
  requestId: number,
  sourceBytes: ArrayBuffer,
  tools: ActiveTool[]
): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    if (!isInitialized) {
      resolve({
        type: 'process-error',
        requestId,
        error: 'Worker not initialized. Call init first.',
      });
      return;
    }

    try {
      const bytes = new Uint8Array(sourceBytes);

      // If no tools, just decode and return pixels
      if (tools.length === 0) {
        ImageMagick.read(bytes, (image) => {
          const width = image.width;
          const height = image.height;

          image.write(MagickFormat.Rgba, (pixels) => {
            // Transfer ownership of the buffer for performance
            const pixelsCopy = new Uint8Array(pixels).buffer;
            resolve({
              type: 'process-complete',
              requestId,
              pixels: pixelsCopy,
              width,
              height,
            });
          });
        });
        return;
      }

      // Sort tools by effect order
      const sortedTools = [...tools].sort((a, b) => {
        const aIndex = EFFECT_ORDER.indexOf(a.id);
        const bIndex = EFFECT_ORDER.indexOf(b.id);
        return (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex);
      });

      ImageMagick.read(bytes, (image) => {
        // Apply effects
        for (const tool of sortedTools) {
          const executor = TOOL_EXECUTORS[tool.id];
          if (executor) {
            executor(image, tool.value);
          }
        }

        const width = image.width;
        const height = image.height;

        image.write(MagickFormat.Rgba, (pixels) => {
          const pixelsCopy = new Uint8Array(pixels).buffer;
          resolve({
            type: 'process-complete',
            requestId,
            pixels: pixelsCopy,
            width,
            height,
          });
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      resolve({
        type: 'process-error',
        requestId,
        error: errorMessage,
      });
    }
  });
}

// ============================================================================
// Worker Message Handler
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'init': {
      const response = await handleInit(message.wasmBytes);
      self.postMessage(response);
      break;
    }
    case 'process': {
      const response = await handleProcess(
        message.requestId,
        message.sourceBytes,
        message.tools
      );
      // Use transferable for pixel data
      if (response.type === 'process-complete') {
        self.postMessage(response, { transfer: [response.pixels] });
      } else {
        self.postMessage(response);
      }
      break;
    }
  }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
