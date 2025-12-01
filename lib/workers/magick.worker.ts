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
import type { IMagickImage } from '@imagemagick/magick-wasm';
import { Percentage, PixelInterpolateMethod } from '@imagemagick/magick-wasm';

// ============================================================================
// Types
// ============================================================================

/** Tool definition for executing effects in the worker */
interface WorkerToolDefinition {
  execute: (image: IMagickImage, value: number) => void;
}

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
// Effect Order and Registry (mirrored from tools-registry.ts)
// ============================================================================

/**
 * Effect application order - must match tools-registry.ts
 */
const EFFECT_ORDER: readonly string[] = [
  'rotate',
  'brightness',
  'saturation', 
  'hue',
  'invert',
  'blur',
  'sharpen',
  'charcoal',
  'edge_detect',
  'grayscale',
  'sepia',
  'contrast',
  'solarize',
  'vignette',
  'wave',
];

/**
 * Tool registry - mirrors TOOL_REGISTRY from tools-registry.ts
 * Duplicated here since workers can't import from main thread modules easily
 */
const WORKER_TOOL_REGISTRY: Record<string, WorkerToolDefinition> = {
  blur: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        image.blur(0, value);
      }
    },
  },

  grayscale: {
    execute: (image: IMagickImage, value: number): void => {
      if (value <= 0) return;
      if (value >= 100) {
        image.grayscale();
      } else {
        const saturation = new Percentage(100 - value);
        image.modulate(new Percentage(100), saturation, new Percentage(100));
      }
    },
  },

  sepia: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        image.sepiaTone(new Percentage(value));
      }
    },
  },

  contrast: {
    execute: (image: IMagickImage, value: number): void => {
      if (value !== 0) {
        image.brightnessContrast(new Percentage(0), new Percentage(value));
      }
    },
  },

  brightness: {
    execute: (image: IMagickImage, value: number): void => {
      image.modulate(new Percentage(value), new Percentage(100), new Percentage(100));
    },
  },

  saturation: {
    execute: (image: IMagickImage, value: number): void => {
      image.modulate(new Percentage(100), new Percentage(value), new Percentage(100));
    },
  },

  hue: {
    execute: (image: IMagickImage, value: number): void => {
      image.modulate(new Percentage(100), new Percentage(100), new Percentage(value));
    },
  },

  invert: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        image.negate();
      }
    },
  },

  sharpen: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        image.sharpen(0, value);
      }
    },
  },

  charcoal: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        image.charcoal(0, value);
      }
    },
  },

  edge_detect: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        const sigma = value;
        (image as unknown as { cannyEdge: (radius: number, sigma: number, lower: Percentage, upper: Percentage) => void })
          .cannyEdge(0, sigma, new Percentage(10), new Percentage(30));
      }
    },
  },

  rotate: {
    execute: (image: IMagickImage, value: number): void => {
      if (value !== 0) {
        image.rotate(value);
      }
    },
  },

  wave: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        const amplitude = (value / 100) * 25;
        const wavelength = 150;
        (image as unknown as { wave: (interpolate: PixelInterpolateMethod, amplitude: number, length: number) => void })
          .wave(PixelInterpolateMethod.Average, amplitude, wavelength);
      }
    },
  },

  solarize: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        image.solarize(new Percentage(value));
      }
    },
  },

  vignette: {
    execute: (image: IMagickImage, value: number): void => {
      if (value > 0) {
        image.vignette(0, value, 0, 0);
      }
    },
  },
};

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
          const toolDef = WORKER_TOOL_REGISTRY[tool.id];
          if (toolDef) {
            toolDef.execute(image, tool.value);
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
