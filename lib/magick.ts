/**
 * Magick.WASM initialization and image processing utilities
 */

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickImage,
} from "@imagemagick/magick-wasm";
import type { ActiveTool } from "./types";
import { TOOL_REGISTRY, EFFECT_ORDER } from "./tools-registry";
import {
  validateImageDimensions,
  MAX_PROCESSING_DIMENSION,
  calculateRGBABufferSize,
} from "./validation";
import {
  MemoryTracker,
  IdleCleanupManager,
  calculateDownscaledDimensions,
  IDLE_CLEANUP_TIMEOUT_MS,
  MemoryUsageInfo,
  MEMORY_BUFFER_NAMES,
} from "./memory-management";
import {
  BufferPool,
  getBufferPool,
  isSharedArrayBufferSupported,
  cloneIfNeeded,
} from "./buffer-pool";

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// ============================================================================
// Worker Manager for Off-Thread Processing
// ============================================================================

/** Cached WASM bytes for worker initialization */
let cachedWasmBytes: ArrayBuffer | null = null;

/** Worker response types */
interface WorkerProcessResponse {
  type: 'process-complete';
  requestId: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
}

interface WorkerErrorResponse {
  type: 'process-error' | 'init-error';
  requestId?: number;
  error: string;
}

type WorkerResponse = WorkerProcessResponse | WorkerErrorResponse | { type: 'init-complete' | 'ready' };

/** Pending request with timeout tracking */
interface PendingRequest {
  resolve: (result: { pixels: Uint8Array; width: number; height: number }) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/** Default timeout for worker requests in milliseconds */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Manager for Web Worker-based image processing.
 * Handles worker lifecycle, initialization, and message passing.
 */
class WorkerManager {
  private worker: Worker | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private requestTimeoutMs: number;

  constructor(options?: { requestTimeoutMs?: number }) {
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Check if Web Workers are supported
   */
  static isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Initialize the worker with WASM bytes
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    // Fetch WASM bytes if not cached
    if (!cachedWasmBytes) {
      const response = await fetch('/magick.wasm');
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status}`);
      }
      cachedWasmBytes = await response.arrayBuffer();
    }

    // Create worker using URL constructor for Next.js compatibility
    this.worker = new Worker(
      new URL('./workers/magick.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Set up message handler
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleMessage(event.data);
    };

    this.worker.onerror = (event) => {
      console.error('Worker error:', event);
      // Reset state so reinitialization can be attempted
      this.isInitialized = false;
      this.initPromise = null;
      // Clear timeouts and reject all pending requests
      for (const [, { reject, timeoutId }] of this.pendingRequests) {
        clearTimeout(timeoutId);
        reject(new Error('Worker error: ' + event.message));
      }
      this.pendingRequests.clear();
    };

    // Wait for worker to be ready, then send init
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'));
      }, 10000);

      const originalHandler = this.worker!.onmessage;
      this.worker!.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'ready') {
          // Worker is ready, send init message
          // Create a fresh ArrayBuffer copy for transfer - this copy gets neutered
          // but cachedWasmBytes remains intact for future worker re-initializations
          const wasmBytesCopy = cachedWasmBytes!.slice(0);
          this.worker!.postMessage({
            type: 'init',
            wasmBytes: wasmBytesCopy,
          }, [wasmBytesCopy]);
        } else if (event.data.type === 'init-complete') {
          clearTimeout(timeout);
          this.worker!.onmessage = originalHandler;
          this.isInitialized = true;
          resolve();
        } else if (event.data.type === 'init-error') {
          clearTimeout(timeout);
          reject(new Error((event.data as WorkerErrorResponse).error));
        }
      };
    });
  }

  private handleMessage(data: WorkerResponse): void {
    if (data.type === 'process-complete') {
      const pending = this.pendingRequests.get(data.requestId);
      if (pending) {
        // Cancel timeout on successful completion (Requirements: 1.5)
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(data.requestId);
        pending.resolve({
          pixels: new Uint8Array(data.pixels),
          width: data.width,
          height: data.height,
        });
      }
    } else if (data.type === 'process-error') {
      const errorData = data as WorkerErrorResponse;
      if (errorData.requestId !== undefined) {
        const pending = this.pendingRequests.get(errorData.requestId);
        if (pending) {
          // Cancel timeout on error completion (Requirements: 1.6)
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(errorData.requestId);
          pending.reject(new Error(errorData.error));
        }
      }
    }
  }

  /**
   * Process image in the worker
   */
  async process(
    sourceBytes: Uint8Array,
    tools: ActiveTool[]
  ): Promise<{ pixels: Uint8Array; width: number; height: number }> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const requestId = ++this.requestId;
    const bytesBuffer = sourceBytes.buffer.slice(
      sourceBytes.byteOffset,
      sourceBytes.byteOffset + sourceBytes.byteLength
    );

    return new Promise((resolve, reject) => {
      // Set up timeout timer (Requirements: 1.1, 1.3, 1.4)
      const timeoutId = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Worker request ${requestId} timed out after ${this.requestTimeoutMs}ms`));
        }
      }, this.requestTimeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      // Send to worker with transferable
      this.worker!.postMessage({
        type: 'process',
        requestId,
        sourceBytes: bytesBuffer,
        tools: tools.map(t => ({ id: t.id, value: t.value })),
      }, [bytesBuffer]);
    });
  }

  /**
   * Terminate the worker
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.initPromise = null;
    // Clear timeouts and reject all pending requests before clearing
    for (const [, { reject, timeoutId }] of this.pendingRequests) {
      clearTimeout(timeoutId);
      reject(new Error('Worker disposed'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Check if worker is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.worker !== null;
  }
}

/** Global worker manager instance */
let globalWorkerManager: WorkerManager | null = null;

/**
 * Get or create the global worker manager
 */
export function getWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager();
  }
  return globalWorkerManager;
}

/**
 * Initialize the worker manager (call early to pre-warm)
 */
export async function initializeWorker(): Promise<void> {
  if (!WorkerManager.isSupported()) {
    console.warn('Web Workers not supported, falling back to main thread processing');
    return;
  }
  const manager = getWorkerManager();
  await manager.initialize();
}

/**
 * Initializes the Magick.WASM library
 * This function is idempotent - calling it multiple times will only initialize once
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeMagick(): Promise<void> {
  if (isInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Fetch the WASM file from public folder
      const wasmResponse = await fetch("/magick.wasm");
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM file: ${wasmResponse.status}`);
      }
      const wasmBytes = await wasmResponse.arrayBuffer();
      await initializeImageMagick(new Uint8Array(wasmBytes));
      isInitialized = true;
    } catch (error) {
      console.error("WASM initialization error:", error);
      initializationPromise = null;
      throw new Error(
        "Failed to initialize image processor. Please refresh the page."
      );
    }
  })();

  return initializationPromise;
}

/**
 * Checks if Magick.WASM has been initialized
 * @returns true if initialized
 */
export function isMagickInitialized(): boolean {
  return isInitialized;
}

/**
 * ImageData structure for image processing operations
 *
 * Architecture Note:
 * - pixels: Current RGBA pixel data for canvas rendering
 * - originalBytes: Source image bytes (PNG/JPEG/etc) for re-processing
 * - width, height: Image dimensions
 *
 * Operation Types:
 * 1. DESTRUCTIVE base transformations (e.g., convertToGrayscale):
 *    - Update originalBytes to reflect the new base state
 *    - Subsequent operations apply to the transformed base
 *
 * 2. NON-DESTRUCTIVE preview transformations (e.g., blurImage):
 *    - Preserve originalBytes unchanged
 *    - Always read from originalBytes for consistent results
 *    - Enable real-time preview with ability to revert
 */
export interface ImageData {
  pixels: Uint8Array;
  width: number;
  height: number;
  originalBytes: Uint8Array;
}

/**
 * Options for acquiring the mutex lock.
 */
interface AcquireOptions {
  /** Timeout in milliseconds. If not acquired within this time, promise rejects. Default: 30000 */
  timeoutMs?: number;
  /** AbortSignal to cancel the acquire attempt */
  signal?: AbortSignal;
}

/**
 * Waiter entry in the queue with cleanup handles.
 */
interface WaiterEntry {
  resolve: () => void;
  reject: (error: Error) => void;
  /** Whether this waiter has been resolved/rejected (for skip detection) */
  settled: boolean;
  /** Timeout timer ID for cleanup */
  timeoutId: ReturnType<typeof setTimeout> | null;
  /** Abort listener cleanup function */
  abortCleanup: (() => void) | null;
}

/** Default timeout for acquire() in milliseconds */
const DEFAULT_ACQUIRE_TIMEOUT_MS = 30000;

/** Maximum number of waiters allowed in the queue */
const MAX_QUEUE_SIZE = 100;

/**
 * Promise-based mutex for protecting shared state in async operations.
 * Ensures only one operation can access protected resources at a time.
 * 
 * Features:
 * - Timeout support: acquire() rejects if lock isn't granted within timeout
 * - AbortSignal support: acquire() rejects if signal is aborted
 * - Queue bounds: acquire() throws immediately if queue is full
 * - Diagnostics: queueLength and isLocked() for monitoring contention
 * - Proper cleanup: timed-out/aborted waiters are removed from queue
 */
class AsyncMutex {
  private locked = false;
  private waitQueue: WaiterEntry[] = [];

  /**
   * Acquires the lock. If already locked, waits until released.
   * 
   * @param options - Optional timeout and abort signal
   * @returns Promise that resolves when lock is acquired
   * @throws Error if timeout expires, signal is aborted, or queue is full
   */
  async acquire(options?: AcquireOptions): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
    const signal = options?.signal;

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('AsyncMutex.acquire: aborted before acquire attempt');
    }

    // Check queue bounds
    if (this.waitQueue.length >= MAX_QUEUE_SIZE) {
      throw new Error(
        `AsyncMutex.acquire: queue is full (${MAX_QUEUE_SIZE} waiters). ` +
        'This may indicate a resource leak or deadlock.'
      );
    }

    // Fast path: lock is free
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Slow path: wait in queue for lock to be released
    return new Promise<void>((resolve, reject) => {
      const entry: WaiterEntry = {
        resolve,
        reject,
        settled: false,
        timeoutId: null,
        abortCleanup: null,
      };

      // Helper to settle this waiter (cleanup and mark as done)
      const settleWithError = (error: Error) => {
        if (entry.settled) return;
        entry.settled = true;
        
        // Clear timeout if set
        if (entry.timeoutId !== null) {
          clearTimeout(entry.timeoutId);
          entry.timeoutId = null;
        }
        
        // Remove abort listener if set
        if (entry.abortCleanup) {
          entry.abortCleanup();
          entry.abortCleanup = null;
        }
        
        // Remove from queue (waiter may still be in queue if not yet processed by release())
        const index = this.waitQueue.indexOf(entry);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        
        reject(error);
      };

      // Set up timeout
      if (timeoutMs > 0 && timeoutMs < Infinity) {
        entry.timeoutId = setTimeout(() => {
          console.warn(
            `AsyncMutex.acquire: timeout after ${timeoutMs}ms. ` +
            `Queue length: ${this.waitQueue.length}, isLocked: ${this.locked}`
          );
          settleWithError(new Error(
            `AsyncMutex.acquire: timeout after ${timeoutMs}ms waiting for lock`
          ));
        }, timeoutMs);
      }

      // Set up abort signal listener
      if (signal) {
        const onAbort = () => {
          settleWithError(new Error('AsyncMutex.acquire: aborted by signal'));
        };
        signal.addEventListener('abort', onAbort);
        entry.abortCleanup = () => signal.removeEventListener('abort', onAbort);
      }

      // Add to queue
      this.waitQueue.push(entry);
    });
  }

  /**
   * Releases the lock and allows next valid waiting operation to proceed.
   * Skips and removes any waiters that have already timed out or been aborted.
   */
  release(): void {
    // Find next valid (non-settled) waiter
    while (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      
      // Skip waiters that have already been settled (timed out / aborted)
      if (next.settled) {
        continue;
      }
      
      // Mark as settled and clean up timers before resolving
      next.settled = true;
      
      if (next.timeoutId !== null) {
        clearTimeout(next.timeoutId);
        next.timeoutId = null;
      }
      
      if (next.abortCleanup) {
        next.abortCleanup();
        next.abortCleanup = null;
      }
      
      // Pass lock to this waiter (lock stays held)
      next.resolve();
      return;
    }
    
    // No valid waiters, release the lock
    this.locked = false;
  }

  /**
   * Checks if the mutex is currently locked.
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Gets the current number of waiters in the queue.
   * Note: Some waiters may be settled (timed out / aborted) but not yet removed.
   */
  get queueLength(): number {
    return this.waitQueue.length;
  }

  /**
   * Gets the number of active (non-settled) waiters in the queue.
   */
  get activeWaitersCount(): number {
    return this.waitQueue.filter(w => !w.settled).length;
  }
}

/**
 * ImageEngine class for optimized image processing with memory management.
 *
 * This class maintains a reference to the decoded source image to avoid
 * redundant decoding operations during slider interactions. When processing,
 * it uses cached pixel data instead of re-decoding from compressed bytes.
 *
 * Memory Management:
 * - Tracks memory usage across all buffers (sourceBytes, cachedPixels, etc.)
 * - Supports downscaling large images for processing (configurable threshold)
 * - Provides idle cleanup to release memory after inactivity
 * - Stores original dimensions for export upscaling
 * - Uses BufferPool for zero-copy buffer reuse when possible
 *
 * Thread Safety:
 * - Uses an AsyncMutex to protect shared state (sourceBytes, cachedPixels, etc.)
 * - loadImage, process, and dispose all acquire the lock before accessing state
 * - Prevents race conditions when concurrent operations are triggered
 *
 * Performance Optimization (slider-performance spec):
 * - Caches decoded RGBA pixels after initial load
 * - process() uses cached pixels instead of re-decoding from bytes
 * - Memoization: Returns cached result if activeTools haven't changed (dirty-check)
 * - processInWorker(): Offloads WASM processing to Web Worker (non-blocking)
 * - Zero-copy returns: Returns views into cached buffers when safe
 * - Significantly reduces CPU usage during slider interactions
 *
 * Requirements: 3.1, 3.2, 3.3, slider-performance 2.1, 2.2, 2.3, 2.4
 */
export class ImageEngine {
  /** Mutex to protect shared state from concurrent access */
  private mutex = new AsyncMutex();
  
  /** Original image bytes for re-processing */
  private sourceBytes: Uint8Array | null = null;
  
  /** Cached decoded RGBA pixel data - avoids re-decoding on every process() */
  private cachedPixels: Uint8Array | null = null;
  
  /** Cached image width (may be downscaled for processing) */
  private cachedWidth: number = 0;
  
  /** Cached image height (may be downscaled for processing) */
  private cachedHeight: number = 0;
  
  /** Original image width (before any downscaling) */
  private originalWidth: number = 0;
  
  /** Original image height (before any downscaling) */
  private originalHeight: number = 0;
  
  /** Scale factor applied during load (1.0 = no downscaling) */
  private loadScale: number = 1.0;
  
  /** Last processed tools signature for memoization */
  private lastToolsSignature: string = '';
  
  /** Cached processed result for memoization */
  private lastProcessedResult: ImageData | null = null;

  /** Worker manager instance for off-thread processing */
  private workerManager: WorkerManager | null = null;
  
  /** Whether to prefer worker-based processing */
  private useWorker: boolean = false;
  
  /** Memory usage tracker */
  private memoryTracker = new MemoryTracker();
  
  /** Idle cleanup manager for memory optimization */
  private idleCleanupManager: IdleCleanupManager;
  
  /** Whether automatic downscaling is enabled */
  private autoDownscale: boolean = true;
  
  /** Maximum dimension for processing (configurable) */
  private maxProcessingDimension: number = MAX_PROCESSING_DIMENSION;
  
  /** Buffer pool for zero-copy operations */
  private bufferPool: BufferPool;
  
  /** Whether to use zero-copy returns (returns views instead of copies) */
  private zeroCopyEnabled: boolean = true;

  constructor(options?: {
    autoDownscale?: boolean;
    maxProcessingDimension?: number;
    idleCleanupTimeoutMs?: number;
    zeroCopyEnabled?: boolean;
  }) {
    this.autoDownscale = options?.autoDownscale ?? true;
    this.maxProcessingDimension = options?.maxProcessingDimension ?? MAX_PROCESSING_DIMENSION;
    this.zeroCopyEnabled = options?.zeroCopyEnabled ?? true;
    this.bufferPool = getBufferPool();
    this.idleCleanupManager = new IdleCleanupManager(
      options?.idleCleanupTimeoutMs ?? IDLE_CLEANUP_TIMEOUT_MS
    );
    
    // Set up idle cleanup to clear memoization cache
    this.idleCleanupManager.setCleanupCallback(() => {
      this.clearMemoizationCache();
    });
  }

  /**
   * Computes a signature string for an array of ActiveTools for memoization.
   * Tools are sorted by id and serialized to ensure consistent comparison.
   */
  private computeToolsSignature(tools: ActiveTool[]): string {
    if (tools.length === 0) return '';
    // Sort by id for consistent ordering, then serialize id:value pairs
    const sorted = [...tools].sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(sorted.map(t => ({ id: t.id, value: t.value })));
  }
  
  /**
   * Updates memory tracking for current buffers
   */
  private updateMemoryTracking(): void {
    if (this.sourceBytes) {
      this.memoryTracker.record(MEMORY_BUFFER_NAMES.SOURCE_BYTES, this.sourceBytes.byteLength);
    } else {
      this.memoryTracker.clear(MEMORY_BUFFER_NAMES.SOURCE_BYTES);
    }
    
    if (this.cachedPixels) {
      this.memoryTracker.record(MEMORY_BUFFER_NAMES.CACHED_PIXELS, this.cachedPixels.byteLength);
    } else {
      this.memoryTracker.clear(MEMORY_BUFFER_NAMES.CACHED_PIXELS);
    }
    
    if (this.lastProcessedResult) {
      this.memoryTracker.record(MEMORY_BUFFER_NAMES.PROCESSED_RESULT, this.lastProcessedResult.pixels.byteLength);
    } else {
      this.memoryTracker.clear(MEMORY_BUFFER_NAMES.PROCESSED_RESULT);
    }
  }
  
  /**
   * Clears the memoization cache to free memory.
   * Called by idle cleanup or manually when memory pressure is high.
   */
  clearMemoizationCache(): void {
    this.lastToolsSignature = '';
    this.lastProcessedResult = null;
    this.memoryTracker.clear(MEMORY_BUFFER_NAMES.PROCESSED_RESULT);
  }
  
  /**
   * Sets the canvas render cache size for memory tracking.
   * Should be called by the component that owns the canvas render cache.
   * @param sizeBytes - Size of the canvas render cache in bytes (0 if empty)
   */
  setCanvasRenderCacheSize(sizeBytes: number): void {
    if (sizeBytes > 0) {
      this.memoryTracker.record(MEMORY_BUFFER_NAMES.CANVAS_RENDER_CACHE, sizeBytes);
    } else {
      this.memoryTracker.clear(MEMORY_BUFFER_NAMES.CANVAS_RENDER_CACHE);
    }
  }
  
  /**
   * Gets current memory usage information (simple version)
   */
  getMemoryUsage(): { totalBytes: number; budgetPercent: number } {
    this.updateMemoryTracking();
    const info = this.memoryTracker.getUsageInfo();
    return {
      totalBytes: info.totalSize,
      budgetPercent: info.budgetUsagePercent,
    };
  }
  
  /**
   * Gets detailed memory usage info for diagnostics panel
   */
  getDetailedMemoryUsage(): MemoryUsageInfo {
    this.updateMemoryTracking();
    return this.memoryTracker.getUsageInfo();
  }
  
  /**
   * Gets comprehensive stats for the "Stats for Nerds" panel
   */
  getFullStats(): {
    memory: MemoryUsageInfo;
    image: {
      originalWidth: number;
      originalHeight: number;
      processingWidth: number;
      processingHeight: number;
      wasDownscaled: boolean;
      loadScale: number;
    } | null;
    isWorkerActive: boolean;
    bufferPool: {
      totalPoolSize: number;
      bufferCount: number;
      activeBuffers: number;
      isUsingSharedArrayBuffer: boolean;
    };
    zeroCopyEnabled: boolean;
  } {
    this.updateMemoryTracking();
    
    const hasImage = this.cachedPixels !== null;
    
    return {
      memory: this.memoryTracker.getUsageInfo(),
      image: hasImage ? {
        originalWidth: this.originalWidth,
        originalHeight: this.originalHeight,
        processingWidth: this.cachedWidth,
        processingHeight: this.cachedHeight,
        wasDownscaled: this.loadScale < 1.0,
        loadScale: this.loadScale,
      } : null,
      isWorkerActive: this.isWorkerReady(),
      bufferPool: this.getBufferPoolStats(),
      zeroCopyEnabled: this.zeroCopyEnabled,
    };
  }
  
  /**
   * Gets original (pre-downscaling) dimensions
   */
  getOriginalDimensions(): { width: number; height: number } | null {
    if (this.originalWidth === 0 || this.originalHeight === 0) return null;
    return { width: this.originalWidth, height: this.originalHeight };
  }
  
  /**
   * Gets the scale factor applied during image load
   */
  getLoadScale(): number {
    return this.loadScale;
  }
  
  /**
   * Checks if the image was downscaled during load
   */
  wasDownscaled(): boolean {
    return this.loadScale < 1.0;
  }
  
  /**
   * Resets the idle timer (call on user activity to delay cleanup)
   */
  resetIdleTimer(): void {
    this.idleCleanupManager.resetTimer();
  }

  /**
   * Enables or disables worker-based processing.
   * When enabled, processInWorker() will use a Web Worker for WASM operations.
   * 
   * @param enabled - Whether to use worker-based processing
   */
  setUseWorker(enabled: boolean): void {
    this.useWorker = enabled && WorkerManager.isSupported();
  }

  /**
   * Initializes the worker manager for off-thread processing.
   * Call this early (e.g., during image load) to pre-warm the worker.
   */
  async initializeWorker(): Promise<void> {
    if (!WorkerManager.isSupported()) return;
    
    if (!this.workerManager) {
      this.workerManager = getWorkerManager();
    }
    await this.workerManager.initialize();
    this.useWorker = true;
  }

  /**
   * Checks if worker-based processing is available and initialized.
   */
  isWorkerReady(): boolean {
    return this.useWorker && this.workerManager?.isReady() === true;
  }

  /**
   * Loads an image from bytes, decodes once, and caches the pixel data.
   * If the image exceeds the processing dimension limit, it will be downscaled.
   * Original dimensions are preserved for export upscaling.
   * 
   * Thread-safe: Acquires mutex before accessing shared state.
   * Lock is released after ImageMagick.read callback completes.
   *
   * @param bytes - The raw image file bytes (PNG/JPEG/etc)
   * @returns Promise<ImageData> with initial pixel data for canvas rendering
   *
   * Requirements: 3.1, slider-performance 2.1, 2.3
   */
  async loadImage(bytes: Uint8Array): Promise<ImageData> {
    if (!isInitialized) {
      throw new Error('Magick.WASM is not initialized');
    }

    // Acquire lock before accessing shared state
    await this.mutex.acquire();

    // Clear any existing data (Requirements: slider-performance 2.3)
    this.clearState();

    // Store the original bytes
    this.sourceBytes = new Uint8Array(bytes);
    this.memoryTracker.record(MEMORY_BUFFER_NAMES.SOURCE_BYTES, this.sourceBytes.byteLength);

    return new Promise<ImageData>((resolve, reject) => {
      let released = false;
      
      const releaseMutex = () => {
        if (!released) {
          released = true;
          this.mutex.release();
        }
      };
      
      const handleError = (error: unknown, context: string) => {
        // Clear state on error
        this.clearState();
        
        releaseMutex();
        
        console.error(`ImageEngine.loadImage error (${context}):`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reject(new Error(`Failed to load image (${context}): ${errorMessage}`));
      };
      
      try {
        // Read the image to get dimensions and pixel data
        ImageMagick.read(this.sourceBytes!, (image) => {
          try {
            // Store original dimensions
            this.originalWidth = image.width;
            this.originalHeight = image.height;
            
            // Validate dimensions
            const dimensionValidation = validateImageDimensions(image.width, image.height);
            if (!dimensionValidation.isValid) {
              handleError(new Error(dimensionValidation.error), 'dimension validation');
              return;
            }
            
            // Check if downscaling is needed
            let targetWidth = image.width;
            let targetHeight = image.height;
            this.loadScale = 1.0;
            
            if (this.autoDownscale && dimensionValidation.needsDownscaling) {
              const scaled = calculateDownscaledDimensions(
                image.width,
                image.height,
                this.maxProcessingDimension
              );
              targetWidth = scaled.width;
              targetHeight = scaled.height;
              this.loadScale = scaled.scale;
              
              // Resize the image for processing
              image.resize(targetWidth, targetHeight);
            }

            // Write to RGBA format for canvas and cache
            image.write(MagickFormat.Rgba, (pixels) => {
              try {
                // Cache the decoded pixels (Requirements: slider-performance 2.1)
                this.cachedPixels = new Uint8Array(pixels);
                this.cachedWidth = targetWidth;
                this.cachedHeight = targetHeight;
                
                // Update memory tracking
                this.memoryTracker.record(MEMORY_BUFFER_NAMES.CACHED_PIXELS, this.cachedPixels.byteLength);
                
                // Start idle cleanup timer
                this.idleCleanupManager.resetTimer();
                
                // Release lock after callback completes
                releaseMutex();
                
                resolve({
                  pixels: new Uint8Array(pixels),
                  width: targetWidth,
                  height: targetHeight,
                  originalBytes: this.sourceBytes!,
                });
              } catch (writeCallbackError) {
                handleError(writeCallbackError, 'write callback');
              }
            });
          } catch (readCallbackError) {
            handleError(readCallbackError, 'read callback');
          }
        });
      } catch (error) {
        handleError(error, 'ImageMagick.read');
      }
    });
  }

  /**
   * Processes the image with the given active tools.
   * Uses cached pixel data when no effects need to be applied,
   * otherwise re-reads from bytes to apply effects (ImageMagick requires this).
   * 
   * Memoization: Returns cached result if activeTools signature matches
   * the last processed tools (dirty-check optimization).
   * 
   * Thread-safe: Acquires mutex before accessing shared state.
   * Lock is released after ImageMagick.read callback completes.
   *
   * @param activeTools - Array of ActiveTool objects specifying effects to apply
   * @returns Promise<ImageData> with processed pixel data
   *
   * Requirements: 3.2, 3.3, slider-performance 2.2
   */
  async process(activeTools: ActiveTool[]): Promise<ImageData> {
    if (!isInitialized) {
      throw new Error('Magick.WASM is not initialized');
    }

    // Acquire lock before accessing shared state
    await this.mutex.acquire();

    if (!this.cachedPixels || !this.sourceBytes) {
      this.mutex.release();
      throw new Error('No image loaded. Call loadImage first.');
    }
    
    // Reset idle timer on activity
    this.idleCleanupManager.resetTimer();

    // Capture references to shared state while holding lock
    const sourceBytes = this.sourceBytes;
    const cachedPixels = this.cachedPixels;
    const cachedWidth = this.cachedWidth;
    const cachedHeight = this.cachedHeight;
    const loadScale = this.loadScale;
    const maxDim = this.maxProcessingDimension;

    // If no tools, return cached pixels directly (fast path)
    if (activeTools.length === 0) {
      // Clear memoization cache for empty tools case
      this.lastToolsSignature = '';
      this.lastProcessedResult = null;
      this.memoryTracker.clear(MEMORY_BUFFER_NAMES.PROCESSED_RESULT);
      
      this.mutex.release();
      // Zero-copy: return view into cached pixels when enabled
      // Caller should not mutate the returned pixels
      return {
        pixels: this.zeroCopyEnabled ? cachedPixels : new Uint8Array(cachedPixels),
        width: cachedWidth,
        height: cachedHeight,
        originalBytes: sourceBytes,
      };
    }

    // Dirty-check: Compare tools signature with last processed
    const currentSignature = this.computeToolsSignature(activeTools);
    if (currentSignature === this.lastToolsSignature && this.lastProcessedResult) {
      // Return cached result - zero-copy when enabled
      // Caller should not mutate the returned pixels
      const cachedResult = this.lastProcessedResult;
      this.mutex.release();
      return {
        pixels: this.zeroCopyEnabled ? cachedResult.pixels : new Uint8Array(cachedResult.pixels),
        width: cachedResult.width,
        height: cachedResult.height,
        originalBytes: cachedResult.originalBytes,
      };
    }

    // For effects, we need to use ImageMagick - read from bytes
    // Note: ImageMagick WASM doesn't support reading from raw RGBA pixels,
    // so we must read from the compressed bytes for effect application
    return new Promise<ImageData>((resolve, reject) => {
      let released = false;
      
      const releaseMutex = () => {
        if (!released) {
          released = true;
          this.mutex.release();
        }
      };
      
      const handleError = (error: unknown, context: string) => {
        releaseMutex();
        
        console.error(`ImageEngine.process error (${context}):`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reject(new Error(`Failed to process image (${context}): ${errorMessage}`));
      };
      
      try {
        ImageMagick.read(sourceBytes, (image) => {
          try {
            // Apply downscaling if needed (same as during load)
            if (loadScale < 1.0) {
              const scaled = calculateDownscaledDimensions(
                image.width,
                image.height,
                maxDim
              );
              image.resize(scaled.width, scaled.height);
            }
            
            // Sort tools by EFFECT_ORDER for consistent application
            const sortedTools = [...activeTools].sort((a, b) => {
              const aIndex = EFFECT_ORDER.indexOf(a.id);
              const bIndex = EFFECT_ORDER.indexOf(b.id);
              // Unknown tools go to the end
              return (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex);
            });

            // Apply effects from registry
            for (const tool of sortedTools) {
              const toolDef = TOOL_REGISTRY[tool.id];
              if (toolDef) {
                toolDef.execute(image, tool.value);
              } else {
                console.warn(`Unknown tool "${tool.id}" skipped during processing`);
              }
            }

            // Write to RGBA for canvas rendering
            image.write(MagickFormat.Rgba, (pixels) => {
              try {
                const result: ImageData = {
                  pixels: new Uint8Array(pixels),
                  width: image.width,
                  height: image.height,
                  originalBytes: sourceBytes,
                };
                
                // Cache the result for memoization
                this.lastToolsSignature = currentSignature;
                this.lastProcessedResult = {
                  pixels: new Uint8Array(pixels), // Store a copy
                  width: image.width,
                  height: image.height,
                  originalBytes: sourceBytes,
                };
                
                // Update memory tracking
                this.memoryTracker.record(MEMORY_BUFFER_NAMES.PROCESSED_RESULT, this.lastProcessedResult.pixels.byteLength);
                
                // Release lock after callback completes
                releaseMutex();
                
                resolve(result);
              } catch (writeCallbackError) {
                handleError(writeCallbackError, 'write callback');
              }
            });
          } catch (readCallbackError) {
            handleError(readCallbackError, 'read callback');
          }
        });
      } catch (error) {
        handleError(error, 'ImageMagick.read');
      }
    });
  }

  /**
   * Processes the image with the given active tools using a Web Worker.
   * This offloads WASM processing to a separate thread, preventing UI blocking.
   * 
   * Falls back to main-thread process() if worker is not available.
   * 
   * Unlike process(), this method does NOT use memoization since it's designed
   * for final processing after user interaction completes (not during drag).
   *
   * @param activeTools - Array of ActiveTool objects specifying effects to apply
   * @returns Promise<ImageData> with processed pixel data
   */
  async processInWorker(activeTools: ActiveTool[]): Promise<ImageData> {
    // Fall back to main thread if worker not ready
    if (!this.isWorkerReady() || !this.workerManager) {
      return this.process(activeTools);
    }

    if (!isInitialized) {
      throw new Error('Magick.WASM is not initialized');
    }

    // Acquire lock to safely access sourceBytes
    await this.mutex.acquire();

    if (!this.sourceBytes) {
      this.mutex.release();
      throw new Error('No image loaded. Call loadImage first.');
    }
    
    // Reset idle timer on activity
    this.idleCleanupManager.resetTimer();

    const sourceBytes = this.sourceBytes;
    const cachedPixels = this.cachedPixels;
    const cachedWidth = this.cachedWidth;
    const cachedHeight = this.cachedHeight;

    // Check fast path while holding lock
    const canUseFastPath = activeTools.length === 0 && cachedPixels !== null;

    // Release lock before worker processing (worker has its own copy)
    this.mutex.release();

    // If no tools, return cached pixels directly (fast path)
    // Zero-copy: return view into cached pixels when enabled
    if (canUseFastPath && cachedPixels) {
      return {
        pixels: this.zeroCopyEnabled ? cachedPixels : new Uint8Array(cachedPixels),
        width: cachedWidth,
        height: cachedHeight,
        originalBytes: sourceBytes,
      };
    }

    try {
      // Process in worker (non-blocking)
      const result = await this.workerManager.process(sourceBytes, activeTools);

      // Re-acquire lock to safely update memoization cache
      await this.mutex.acquire();
      try {
        // Update memoization cache with worker result
        const currentSignature = this.computeToolsSignature(activeTools);
        this.lastToolsSignature = currentSignature;
        this.lastProcessedResult = {
          pixels: new Uint8Array(result.pixels),
          width: result.width,
          height: result.height,
          originalBytes: sourceBytes,
        };
        
        // Update memory tracking
        this.memoryTracker.record(MEMORY_BUFFER_NAMES.PROCESSED_RESULT, this.lastProcessedResult.pixels.byteLength);
      } finally {
        this.mutex.release();
      }

      return {
        pixels: result.pixels,
        width: result.width,
        height: result.height,
        originalBytes: sourceBytes,
      };
    } catch (error) {
      // On worker error, fall back to main thread
      console.warn('Worker processing failed, falling back to main thread:', error);
      return this.process(activeTools);
    }
  }

  /**
   * Clears all cached data and releases memory.
   * Should be called when the image is no longer needed or before loading a new image.
   * 
   * Thread-safe: Waits for any in-progress operations to complete before clearing state.
   * This is the only public method for cleanup - use this instead of any synchronous variant.
   * 
   * Requirements: 3.3, slider-performance 2.4
   */
  async disposeAsync(): Promise<void> {
    // Cancel any pending idle cleanup
    this.idleCleanupManager.dispose();
    
    // Acquire lock to ensure no operations are in progress
    await this.mutex.acquire();
    try {
      this.clearState();
    } finally {
      this.mutex.release();
    }
  }

  /**
   * Internal synchronous dispose - clears state immediately without waiting for lock.
   * Private: Only used internally (e.g., in loadImage when clearing previous state while holding lock).
   * External callers must use disposeAsync() for thread-safe cleanup.
   * 
   * Requirements: 3.3, slider-performance 2.4
   */
  private clearState(): void {
    this.sourceBytes = null;
    this.cachedPixels = null;
    this.cachedWidth = 0;
    this.cachedHeight = 0;
    this.originalWidth = 0;
    this.originalHeight = 0;
    this.loadScale = 1.0;
    // Clear memoization cache
    this.lastToolsSignature = '';
    this.lastProcessedResult = null;
    // Clear memory tracking
    this.memoryTracker.clearAll();
  }

  /**
   * Checks if an image is currently loaded.
   * @returns true if an image is loaded and ready for processing
   */
  hasImage(): boolean {
    return this.cachedPixels !== null;
  }
  
  /**
   * Returns the cached pixel data if available.
   * Useful for testing and debugging.
   * @returns The cached pixels or null if no image is loaded
   */
  getCachedPixels(): Uint8Array | null {
    return this.cachedPixels;
  }
  
  /**
   * Returns the cached dimensions.
   * @returns Object with width and height, or null if no image is loaded
   */
  getCachedDimensions(): { width: number; height: number } | null {
    if (!this.cachedPixels) return null;
    return { width: this.cachedWidth, height: this.cachedHeight };
  }
  
  /**
   * Check if zero-copy mode is enabled
   */
  isZeroCopyEnabled(): boolean {
    return this.zeroCopyEnabled;
  }
  
  /**
   * Enable or disable zero-copy returns
   * When enabled, process() returns views into cached buffers (faster, less memory)
   * When disabled, process() returns copies (safer if caller mutates data)
   * 
   * @param enabled - Whether to enable zero-copy mode
   */
  setZeroCopyEnabled(enabled: boolean): void {
    this.zeroCopyEnabled = enabled;
  }
  
  /**
   * Check if SharedArrayBuffer is being used by the buffer pool
   */
  isUsingSharedArrayBuffer(): boolean {
    return this.bufferPool.isUsingSharedArrayBuffer();
  }
  
  /**
   * Get buffer pool statistics for diagnostics
   */
  getBufferPoolStats(): {
    totalPoolSize: number;
    bufferCount: number;
    activeBuffers: number;
    isUsingSharedArrayBuffer: boolean;
  } {
    return {
      totalPoolSize: this.bufferPool.getTotalPoolSize(),
      bufferCount: this.bufferPool.getBufferCount(),
      activeBuffers: this.bufferPool.getActiveBufferCount(),
      isUsingSharedArrayBuffer: this.bufferPool.isUsingSharedArrayBuffer(),
    };
  }
}

/**
 * Reads image data and returns pixel data for canvas rendering
 * @param data - Image data as Uint8Array (original file bytes)
 * @returns Object containing pixel data, dimensions, and original bytes for re-processing
 */
export function readImageData(data: Uint8Array): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(data, (image) => {
        const width = image.width;
        const height = image.height;

        // Write to RGBA format for canvas
        image.write(MagickFormat.Rgba, (pixels) => {
          // pixels is already in RGBA format, 1 byte per channel
          resolve({
            pixels: new Uint8Array(pixels),
            width,
            height,
            originalBytes: new Uint8Array(data),
          });
        });
      });
    } catch {
      reject(new Error("Failed to read image data"));
    }
  });
}

/**
 * Converts image data to grayscale using Magick.WASM
 *
 * NOTE: This is a DESTRUCTIVE base transformation that updates originalBytes.
 * Unlike blurImage (which is non-destructive), this operation modifies the base
 * image state so that subsequent operations (like blur) are applied to the grayscale version.
 *
 * @param data - Original image data containing originalBytes for re-processing
 * @returns Promise containing grayscale image data with updated originalBytes (grayscale PNG)
 */
export function convertToGrayscale(data: ImageData): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  return new Promise((resolve, reject) => {
    try {
      // Read from original file bytes and apply grayscale
      ImageMagick.read(data.originalBytes, (image) => {
        // Apply grayscale conversion
        image.grayscale();

        const width = image.width;
        const height = image.height;

        // Write to PNG format to preserve the grayscale state for future operations
        image.write(MagickFormat.Png, (pngBytes) => {
          const newOriginalBytes = new Uint8Array(pngBytes);

          // Write back to RGBA format for canvas rendering
          image.write(MagickFormat.Rgba, (pixels) => {
            resolve({
              pixels: new Uint8Array(pixels),
              width,
              height,
              originalBytes: newOriginalBytes, // DESTRUCTIVE: Update originalBytes to grayscale version
            });
          });
        });
      });
    } catch {
      reject(new Error("Failed to convert image to grayscale"));
    }
  });
}

/**
 * Applies Gaussian blur to an image
 *
 * NOTE: This is a NON-DESTRUCTIVE preview transformation that preserves originalBytes.
 * Unlike convertToGrayscale (which is destructive), this operation always reads from
 * originalBytes and returns new pixels without modifying the base image state.
 * This enables real-time blur preview with the ability to return to the unblurred state.
 *
 * @param data - ImageData containing originalBytes for non-destructive editing
 * @param radius - Blur radius (0-20). A radius of 0 returns the original image unchanged.
 * @returns Promise<ImageData> with blurred pixels and preserved originalBytes
 */
export function blurImage(data: ImageData, radius: number): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(data.originalBytes, (image) => {
        const width = image.width;
        const height = image.height;

        // Handle radius 0 as identity - return original pixels
        if (radius === 0) {
          image.write(MagickFormat.Rgba, (pixels) => {
            resolve({
              pixels: new Uint8Array(pixels),
              width,
              height,
              originalBytes: data.originalBytes,
            });
          });
          return;
        }

        // Apply Gaussian blur - blur(0, sigma) lets ImageMagick auto-calculate kernel size
        image.blur(0, radius);

        // Write to RGBA for canvas rendering
        image.write(MagickFormat.Rgba, (pixels) => {
          resolve({
            pixels: new Uint8Array(pixels),
            width,
            height,
            originalBytes: data.originalBytes, // NON-DESTRUCTIVE: Preserve original for non-destructive editing
          });
        });
      });
    } catch {
      reject(new Error("Failed to apply blur effect"));
    }
  });
}

/**
 * Applies multiple effects to an image in a single read/write cycle.
 * Effects are applied in a consistent order defined by EFFECT_ORDER from the registry.
 *
 * NOTE: This is a NON-DESTRUCTIVE preview transformation that preserves originalBytes.
 * All effects are applied to the original image data, enabling real-time preview
 * with the ability to return to the original state.
 *
 * @param data - ImageData containing originalBytes for non-destructive editing
 * @param tools - Array of ActiveTool objects specifying which effects to apply and their values
 * @returns Promise<ImageData> with all effects applied and preserved originalBytes
 *
 * Requirements: 2.3, 2.4, 5.2, 5.3
 */
export function applyEffectsPipeline(
  data: ImageData,
  tools: ActiveTool[]
): Promise<ImageData> {
  if (!isInitialized) {
    return Promise.reject(new Error("Magick.WASM is not initialized"));
  }

  // If no tools, return original image
  if (tools.length === 0) {
    return new Promise((resolve, reject) => {
      try {
        ImageMagick.read(data.originalBytes, (image) => {
          const width = image.width;
          const height = image.height;
          image.write(MagickFormat.Rgba, (pixels) => {
            resolve({
              pixels: new Uint8Array(pixels),
              width,
              height,
              originalBytes: data.originalBytes,
            });
          });
        });
      } catch {
        reject(new Error("Failed to read image data"));
      }
    });
  }

  // Sort tools by EFFECT_ORDER for consistent application
  const sortedTools = [...tools].sort((a, b) => {
    const aIndex = EFFECT_ORDER.indexOf(a.id);
    const bIndex = EFFECT_ORDER.indexOf(b.id);
    // Unknown tools go to the end
    return (
      (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex)
    );
  });

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(data.originalBytes, (image) => {
        const width = image.width;
        const height = image.height;

        // Apply effects using TOOL_REGISTRY lookup instead of switch statement
        for (const tool of sortedTools) {
          const toolDef = TOOL_REGISTRY[tool.id];
          if (toolDef) {
            toolDef.execute(image, tool.value);
          } else {
            console.warn(`Unknown tool "${tool.id}" skipped during processing`);
          }
        }

        // Write to RGBA for canvas rendering (single write at the end)
        image.write(MagickFormat.Rgba, (pixels) => {
          resolve({
            pixels: new Uint8Array(pixels),
            width,
            height,
            originalBytes: data.originalBytes, // NON-DESTRUCTIVE: Preserve original
          });
        });
      });
    } catch {
      reject(new Error("Failed to apply effects pipeline"));
    }
  });
}

export { ImageMagick, MagickFormat };
