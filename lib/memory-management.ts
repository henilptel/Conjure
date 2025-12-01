/**
 * Memory management utilities for image processing
 * 
 * This module provides strategies for managing memory usage when working
 * with large images, including:
 * - Memory usage tracking and limits
 * - Idle cleanup scheduling
 * - Downscaling utilities for processing
 * - Memory pressure detection
 */

import {
  MAX_PROCESSING_DIMENSION,
  calculateRGBABufferSize,
  estimateImageMemoryUsage,
} from './validation';

/**
 * Maximum memory budget for image processing in bytes.
 * Default: 200MB - allows for multiple buffers of 4K images
 */
export const MAX_MEMORY_BUDGET_BYTES = 200 * 1024 * 1024;

/**
 * Memory threshold to trigger cleanup (as fraction of budget).
 * When usage exceeds 80% of budget, consider cleanup.
 */
export const MEMORY_CLEANUP_THRESHOLD = 0.8;

/**
 * Idle timeout before memory cleanup in milliseconds.
 * Default: 30 seconds of inactivity before clearing caches.
 */
export const IDLE_CLEANUP_TIMEOUT_MS = 30_000;

/**
 * Minimum idle timeout (for testing or aggressive cleanup).
 */
export const MIN_IDLE_CLEANUP_TIMEOUT_MS = 5_000;

/**
 * Structure tracking current memory usage
 */
export interface MemoryUsageInfo {
  /** Size of compressed source bytes */
  sourceBytesSize: number;
  /** Size of cached RGBA pixels */
  cachedPixelsSize: number;
  /** Size of memoized processed result */
  processedResultSize: number;
  /** Size of canvas render cache */
  canvasRenderCacheSize: number;
  /** Total estimated memory usage */
  totalSize: number;
  /** Percentage of memory budget used */
  budgetUsagePercent: number;
}

/**
 * Calculates scaling factor to fit dimensions within max bounds
 * @param width - Original width
 * @param height - Original height
 * @param maxDimension - Maximum allowed dimension
 * @returns Scale factor (1.0 means no scaling needed)
 */
export function calculateDownscaleFactor(
  width: number,
  height: number,
  maxDimension: number = MAX_PROCESSING_DIMENSION
): number {
  if (width <= maxDimension && height <= maxDimension) {
    return 1.0;
  }
  
  return Math.min(maxDimension / width, maxDimension / height);
}

/**
 * Calculates downscaled dimensions while preserving aspect ratio
 * @param width - Original width
 * @param height - Original height
 * @param maxDimension - Maximum allowed dimension
 * @returns Downscaled dimensions
 */
export function calculateDownscaledDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_PROCESSING_DIMENSION
): { width: number; height: number; scale: number } {
  const scale = calculateDownscaleFactor(width, height, maxDimension);
  
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
  };
}

/**
 * Estimates if loading an image would exceed memory budget
 * @param width - Image width
 * @param height - Image height
 * @param compressedSize - Size of compressed source bytes
 * @param currentUsage - Current memory usage in bytes
 * @returns Whether loading would exceed budget
 */
export function wouldExceedMemoryBudget(
  width: number,
  height: number,
  compressedSize: number,
  currentUsage: number = 0
): boolean {
  const estimatedUsage = estimateImageMemoryUsage(width, height, compressedSize);
  return currentUsage + estimatedUsage > MAX_MEMORY_BUDGET_BYTES;
}

/**
 * Determines the recommended action based on memory analysis
 */
export type MemoryAction = 
  | { type: 'proceed' }
  | { type: 'downscale'; targetWidth: number; targetHeight: number; scale: number }
  | { type: 'reject'; reason: string };

/**
 * Analyzes image and returns recommended memory action
 * @param width - Image width
 * @param height - Image height
 * @param compressedSize - Size of compressed source bytes
 * @param currentUsage - Current memory usage in bytes
 * @returns Recommended action
 */
export function analyzeMemoryRequirements(
  width: number,
  height: number,
  compressedSize: number,
  currentUsage: number = 0
): MemoryAction {
  // Check if downscaling helps
  const { width: dsWidth, height: dsHeight, scale } = calculateDownscaledDimensions(
    width,
    height,
    MAX_PROCESSING_DIMENSION
  );
  
  // If already within limits, check direct loading
  if (scale === 1.0) {
    const estimatedUsage = estimateImageMemoryUsage(width, height, compressedSize);
    if (currentUsage + estimatedUsage <= MAX_MEMORY_BUDGET_BYTES) {
      return { type: 'proceed' };
    }
    // Image is within dimension limits but exceeds memory budget
    // Try downscaling anyway
    const forcedScale = 0.75; // 75% of current size
    const forcedWidth = Math.round(width * forcedScale);
    const forcedHeight = Math.round(height * forcedScale);
    const forcedUsage = estimateImageMemoryUsage(forcedWidth, forcedHeight, compressedSize);
    
    if (currentUsage + forcedUsage > MAX_MEMORY_BUDGET_BYTES) {
      return {
        type: 'reject',
        reason: `Image requires approximately ${Math.round(forcedUsage / (1024 * 1024))}MB which exceeds available memory budget.`,
      };
    }
    
    return {
      type: 'downscale',
      targetWidth: forcedWidth,
      targetHeight: forcedHeight,
      scale: forcedScale,
    };
  }
  
  // Check if downscaled version fits
  const downscaledUsage = estimateImageMemoryUsage(dsWidth, dsHeight, compressedSize);
  if (currentUsage + downscaledUsage <= MAX_MEMORY_BUDGET_BYTES) {
    return {
      type: 'downscale',
      targetWidth: dsWidth,
      targetHeight: dsHeight,
      scale,
    };
  }
  
  // Even downscaled version exceeds budget
  return {
    type: 'reject',
    reason: `Image requires approximately ${Math.round(downscaledUsage / (1024 * 1024))}MB which exceeds available memory budget.`,
  };
}

/**
 * Manager for idle-based memory cleanup
 * Schedules cleanup of caches after a period of inactivity
 */
export class IdleCleanupManager {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private cleanupCallback: (() => void) | null = null;
  private idleTimeoutMs: number;
  
  constructor(idleTimeoutMs: number = IDLE_CLEANUP_TIMEOUT_MS) {
    this.idleTimeoutMs = Math.max(idleTimeoutMs, MIN_IDLE_CLEANUP_TIMEOUT_MS);
  }
  
  /**
   * Sets the callback to execute when idle cleanup is triggered
   */
  setCleanupCallback(callback: () => void): void {
    this.cleanupCallback = callback;
  }
  
  /**
   * Resets the idle timer (call on user activity)
   */
  resetTimer(): void {
    this.cancelTimer();
    
    if (this.cleanupCallback) {
      this.timeoutId = setTimeout(() => {
        this.cleanupCallback?.();
        this.timeoutId = null;
      }, this.idleTimeoutMs);
    }
  }
  
  /**
   * Cancels any pending cleanup
   */
  cancelTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
  
  /**
   * Disposes the manager and cancels any pending cleanup
   */
  dispose(): void {
    this.cancelTimer();
    this.cleanupCallback = null;
  }
  
  /**
   * Gets the configured idle timeout in milliseconds
   */
  getIdleTimeout(): number {
    return this.idleTimeoutMs;
  }
  
  /**
   * Checks if a cleanup is currently scheduled
   */
  isCleanupScheduled(): boolean {
    return this.timeoutId !== null;
  }
}

/**
 * Tracks memory usage across multiple buffers
 */
export class MemoryTracker {
  private usage: Map<string, number> = new Map();
  
  /**
   * Records memory usage for a named buffer
   */
  record(name: string, sizeBytes: number): void {
    this.usage.set(name, sizeBytes);
  }
  
  /**
   * Clears recorded usage for a named buffer
   */
  clear(name: string): void {
    this.usage.delete(name);
  }
  
  /**
   * Clears all recorded usage
   */
  clearAll(): void {
    this.usage.clear();
  }
  
  /**
   * Gets total recorded memory usage
   */
  getTotalUsage(): number {
    let total = 0;
    for (const size of this.usage.values()) {
      total += size;
    }
    return total;
  }
  
  /**
   * Gets detailed memory usage info
   */
  getUsageInfo(): MemoryUsageInfo {
    const sourceBytesSize = this.usage.get('sourceBytes') ?? 0;
    const cachedPixelsSize = this.usage.get('cachedPixels') ?? 0;
    const processedResultSize = this.usage.get('processedResult') ?? 0;
    const canvasRenderCacheSize = this.usage.get('canvasRenderCache') ?? 0;
    const totalSize = this.getTotalUsage();
    
    return {
      sourceBytesSize,
      cachedPixelsSize,
      processedResultSize,
      canvasRenderCacheSize,
      totalSize,
      budgetUsagePercent: (totalSize / MAX_MEMORY_BUDGET_BYTES) * 100,
    };
  }
  
  /**
   * Checks if usage exceeds cleanup threshold
   */
  shouldTriggerCleanup(): boolean {
    return this.getTotalUsage() > MAX_MEMORY_BUDGET_BYTES * MEMORY_CLEANUP_THRESHOLD;
  }
}

/**
 * Formats bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
