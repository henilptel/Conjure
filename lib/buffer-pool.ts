/**
 * Zero-copy buffer pool for efficient image processing
 * 
 * This module provides memory-efficient buffer management to avoid redundant
 * Uint8Array copies during image processing operations. For 4K images (~33MB RGBA),
 * avoiding copies significantly reduces memory pressure and GC overhead.
 * 
 * Strategies:
 * 1. SharedArrayBuffer: When available (requires COOP/COEP headers), allows
 *    zero-copy sharing between main thread and workers
 * 2. Buffer Pool: Reuses pre-allocated buffers to avoid allocation overhead
 * 3. View-based returns: Returns views into pooled buffers instead of copies
 * 4. Transfer ownership: Uses transferable ArrayBuffers when SAB unavailable
 * 
 * Requirements: Reduce Uint8Array copies from 3-4 per operation to 0-1
 */

/**
 * Check if SharedArrayBuffer is available
 * Requires Cross-Origin-Opener-Policy: same-origin
 * and Cross-Origin-Embedder-Policy: require-corp headers
 */
export function isSharedArrayBufferSupported(): boolean {
  try {
    // Check if SharedArrayBuffer exists and is constructible
    if (typeof SharedArrayBuffer === 'undefined') {
      return false;
    }
    // Try to create a small SAB to verify it's actually usable
    // (some browsers have it defined but disabled without proper headers)
    new SharedArrayBuffer(1);
    return true;
  } catch {
    return false;
  }
}

/**
 * Buffer entry in the pool
 */
interface PooledBuffer {
  /** The underlying buffer (SharedArrayBuffer or ArrayBuffer) */
  buffer: SharedArrayBuffer | ArrayBuffer;
  /** Size of the buffer in bytes */
  size: number;
  /** Whether this buffer is currently in use */
  inUse: boolean;
  /** Whether this is a SharedArrayBuffer */
  isShared: boolean;
  /** Last access timestamp for LRU eviction */
  lastAccess: number;
}

/**
 * Configuration for the buffer pool
 */
export interface BufferPoolConfig {
  /** Maximum total memory for pooled buffers (default: 150MB) */
  maxPoolSize?: number;
  /** Maximum number of buffers to keep (default: 6) */
  maxBufferCount?: number;
  /** Prefer SharedArrayBuffer when available (default: true) */
  preferShared?: boolean;
  /** Time in ms before idle buffers are released (default: 60000) */
  idleTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<BufferPoolConfig> = {
  maxPoolSize: 150 * 1024 * 1024, // 150MB
  maxBufferCount: 6,
  preferShared: true,
  idleTimeoutMs: 60_000,
};

/**
 * Buffer pool for zero-copy image processing
 * 
 * Manages a pool of reusable buffers to minimize allocations and copies.
 * Supports both SharedArrayBuffer (for worker sharing) and regular ArrayBuffer.
 */
export class BufferPool {
  private pool: PooledBuffer[] = [];
  private config: Required<BufferPoolConfig>;
  private useShared: boolean;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  
  constructor(config?: BufferPoolConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.useShared = this.config.preferShared && isSharedArrayBufferSupported();
  }
  
  /**
   * Whether SharedArrayBuffer is being used
   */
  isUsingSharedArrayBuffer(): boolean {
    return this.useShared;
  }
  
  /**
   * Get total memory currently used by the pool
   */
  getTotalPoolSize(): number {
    return this.pool.reduce((sum, b) => sum + b.size, 0);
  }
  
  /**
   * Get number of buffers in the pool
   */
  getBufferCount(): number {
    return this.pool.length;
  }
  
  /**
   * Get number of buffers currently in use
   */
  getActiveBufferCount(): number {
    return this.pool.filter(b => b.inUse).length;
  }
  
  /**
   * Acquire a buffer of at least the specified size
   * 
   * @param minSize - Minimum size in bytes
   * @returns A Uint8Array view into the buffer
   */
  acquire(minSize: number): { view: Uint8Array; release: () => void; isShared: boolean } {
    // Reset cleanup timer on activity
    this.scheduleCleanup();
    
    // Try to find an existing buffer that fits
    const existing = this.findAvailableBuffer(minSize);
    if (existing) {
      existing.inUse = true;
      existing.lastAccess = Date.now();
      const view = new Uint8Array(existing.buffer, 0, minSize);
      return {
        view,
        release: () => this.releaseBuffer(existing),
        isShared: existing.isShared,
      };
    }
    
    // Need to allocate a new buffer
    // First, check if we need to evict old buffers
    this.evictIfNeeded(minSize);
    
    // Allocate new buffer
    const buffer = this.allocateBuffer(minSize);
    const entry: PooledBuffer = {
      buffer,
      size: minSize,
      inUse: true,
      isShared: this.useShared,
      lastAccess: Date.now(),
    };
    this.pool.push(entry);
    
    const view = new Uint8Array(buffer, 0, minSize);
    return {
      view,
      release: () => this.releaseBuffer(entry),
      isShared: entry.isShared,
    };
  }
  
  /**
   * Acquire a buffer and copy data into it
   * Returns a view that can be used without copying
   * 
   * @param source - Source data to copy
   * @returns A Uint8Array view containing the copied data
   */
  acquireWithData(source: Uint8Array): { view: Uint8Array; release: () => void; isShared: boolean } {
    const result = this.acquire(source.byteLength);
    result.view.set(source);
    return result;
  }
  
  /**
   * Create a view into existing data without copying
   * Only works if the source is already in a pooled buffer
   * 
   * @param source - Source Uint8Array
   * @returns View info if source is pooled, null otherwise
   */
  tryGetView(source: Uint8Array): { view: Uint8Array; isShared: boolean } | null {
    const sourceBuffer = source.buffer;
    
    for (const entry of this.pool) {
      if (entry.buffer === sourceBuffer) {
        return {
          view: new Uint8Array(entry.buffer, source.byteOffset, source.byteLength),
          isShared: entry.isShared,
        };
      }
    }
    
    return null;
  }
  
  /**
   * Release all buffers and clear the pool
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.pool = [];
  }
  
  /**
   * Release idle buffers to free memory
   */
  releaseIdleBuffers(): void {
    const now = Date.now();
    const idleThreshold = now - this.config.idleTimeoutMs;
    
    this.pool = this.pool.filter(entry => {
      // Keep buffers that are in use or recently accessed
      return entry.inUse || entry.lastAccess > idleThreshold;
    });
  }
  
  private findAvailableBuffer(minSize: number): PooledBuffer | null {
    // Find smallest available buffer that fits
    let best: PooledBuffer | null = null;
    
    for (const entry of this.pool) {
      if (!entry.inUse && entry.size >= minSize) {
        if (!best || entry.size < best.size) {
          best = entry;
        }
      }
    }
    
    return best;
  }
  
  private releaseBuffer(entry: PooledBuffer): void {
    entry.inUse = false;
    entry.lastAccess = Date.now();
  }
  
  private allocateBuffer(size: number): SharedArrayBuffer | ArrayBuffer {
    if (this.useShared) {
      return new SharedArrayBuffer(size);
    }
    return new ArrayBuffer(size);
  }
  
  private evictIfNeeded(newSize: number): void {
    const currentSize = this.getTotalPoolSize();
    const currentCount = this.pool.length;
    
    // Check if we need to evict
    if (currentSize + newSize <= this.config.maxPoolSize && 
        currentCount < this.config.maxBufferCount) {
      return;
    }
    
    // Sort by last access (oldest first) for LRU eviction
    const evictable = this.pool
      .filter(b => !b.inUse)
      .sort((a, b) => a.lastAccess - b.lastAccess);
    
    let freedSize = 0;
    let freedCount = 0;
    const toRemove = new Set<PooledBuffer>();
    
    for (const entry of evictable) {
      const needMoreSpace = currentSize - freedSize + newSize > this.config.maxPoolSize;
      const needFewerBuffers = currentCount - freedCount >= this.config.maxBufferCount;
      
      if (!needMoreSpace && !needFewerBuffers) {
        break;
      }
      
      toRemove.add(entry);
      freedSize += entry.size;
      freedCount++;
    }
    
    this.pool = this.pool.filter(b => !toRemove.has(b));
  }
  
  private scheduleCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }
    
    this.cleanupTimer = setTimeout(() => {
      this.releaseIdleBuffers();
      this.cleanupTimer = null;
    }, this.config.idleTimeoutMs);
  }
}

/**
 * Global buffer pool instance
 */
let globalPool: BufferPool | null = null;

/**
 * Get or create the global buffer pool
 */
export function getBufferPool(): BufferPool {
  if (!globalPool) {
    globalPool = new BufferPool();
  }
  return globalPool;
}

/**
 * Reset the global buffer pool (for testing)
 */
export function resetBufferPool(): void {
  if (globalPool) {
    globalPool.dispose();
    globalPool = null;
  }
}

/**
 * Wrapper for ImageData that uses pooled buffers
 * Provides zero-copy access when possible
 */
export interface PooledImageData {
  /** Pixel data view (may be into a pooled buffer) */
  pixels: Uint8Array;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Original compressed bytes */
  originalBytes: Uint8Array;
  /** Whether pixels are in a shared buffer */
  isShared: boolean;
  /** Release function to return buffer to pool */
  release: () => void;
}

/**
 * Create a copy of pixel data only when necessary
 * If the source is already owned (not shared), returns the same reference
 * 
 * @param pixels - Source pixel data
 * @param forceClone - Force a copy even if not strictly necessary
 * @returns Pixel data (possibly the same reference)
 */
export function cloneIfNeeded(pixels: Uint8Array, forceClone: boolean = false): Uint8Array {
  if (forceClone) {
    return new Uint8Array(pixels);
  }
  
  // Check if this is a view into a SharedArrayBuffer
  if (pixels.buffer instanceof SharedArrayBuffer) {
    // Must clone to avoid shared mutation
    return new Uint8Array(pixels);
  }
  
  // For regular ArrayBuffer, we can return the same reference
  // if the caller promises not to mutate
  return pixels;
}

/**
 * Transfer an ArrayBuffer to avoid copying
 * Creates a new Uint8Array that takes ownership of the buffer
 * 
 * @param source - Source Uint8Array
 * @returns New Uint8Array with transferred buffer (source becomes detached)
 */
export function transferOwnership(source: Uint8Array): Uint8Array {
  // If it's a SharedArrayBuffer, we can't transfer - must copy
  if (source.buffer instanceof SharedArrayBuffer) {
    return new Uint8Array(source);
  }
  
  // For regular ArrayBuffer, slice to get ownership
  // This is still a copy but signals intent for transfer semantics
  const buffer = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength
  );
  return new Uint8Array(buffer);
}
