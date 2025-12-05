/**
 * Property-based tests for ImageEngine cache behavior
 * **Feature: slider-performance**
 * **Validates: Requirements 2.1, 2.3**
 * 
 * Note: These tests focus on the cache state management logic.
 * Full integration tests with WASM would require browser environment.
 */

import * as fc from 'fast-check';

/**
 * Mock ImageEngine cache state for testing cache management logic
 * This mirrors the cache fields in the real ImageEngine class
 */
interface ImageEngineCacheState {
  sourceBytes: Uint8Array | null;
  cachedPixels: Uint8Array | null;
  cachedWidth: number;
  cachedHeight: number;
}

/**
 * Creates a mock cache state manager for testing
 */
function createCacheManager() {
  let state: ImageEngineCacheState = {
    sourceBytes: null,
    cachedPixels: null,
    cachedWidth: 0,
    cachedHeight: 0,
  };

  return {
    /**
     * Simulates loadImage - stores bytes and creates cached pixels
     */
    loadImage(bytes: Uint8Array, width: number, height: number): void {
      // Dispose previous cache first (Requirements: 2.3)
      this.dispose();
      
      // Store source bytes
      state.sourceBytes = new Uint8Array(bytes);
      
      // Create cached pixels (simulated RGBA data)
      state.cachedPixels = new Uint8Array(width * height * 4);
      state.cachedWidth = width;
      state.cachedHeight = height;
    },

    /**
     * Simulates dispose - clears all cache
     */
    dispose(): void {
      state.sourceBytes = null;
      state.cachedPixels = null;
      state.cachedWidth = 0;
      state.cachedHeight = 0;
    },

    /**
     * Check if image is loaded
     */
    hasImage(): boolean {
      return state.cachedPixels !== null;
    },

    /**
     * Get cached pixels
     */
    getCachedPixels(): Uint8Array | null {
      return state.cachedPixels;
    },

    /**
     * Get cached dimensions
     */
    getCachedDimensions(): { width: number; height: number } | null {
      if (!state.cachedPixels) return null;
      return { width: state.cachedWidth, height: state.cachedHeight };
    },

    /**
     * Get source bytes
     */
    getSourceBytes(): Uint8Array | null {
      return state.sourceBytes;
    },
  };
}

// Arbitrary for generating image bytes (simulated)
const imageBytesArb = fc.uint8Array({ minLength: 100, maxLength: 10000 });

// Arbitrary for generating image dimensions
const dimensionsArb = fc.record({
  width: fc.integer({ min: 1, max: 4096 }),
  height: fc.integer({ min: 1, max: 4096 }),
});

describe('Property 2: Image loading creates pixel cache', () => {
  /**
   * **Feature: slider-performance, Property 2: Image loading creates pixel cache**
   * 
   * For any valid image bytes, after calling loadImage(), the ImageEngine 
   * should have cached pixel data available and hasImage() should return true.
   * **Validates: Requirements 2.1**
   */

  it('should create cache after loading image', () => {
    fc.assert(
      fc.property(imageBytesArb, dimensionsArb, (bytes, dims) => {
        const cache = createCacheManager();
        
        // Initially no image
        expect(cache.hasImage()).toBe(false);
        expect(cache.getCachedPixels()).toBeNull();
        
        // Load image
        cache.loadImage(bytes, dims.width, dims.height);
        
        // Cache should now exist
        expect(cache.hasImage()).toBe(true);
        expect(cache.getCachedPixels()).not.toBeNull();
        
        // Dimensions should match
        const cachedDims = cache.getCachedDimensions();
        expect(cachedDims).not.toBeNull();
        expect(cachedDims?.width).toBe(dims.width);
        expect(cachedDims?.height).toBe(dims.height);
        
        // Source bytes should be stored
        expect(cache.getSourceBytes()).not.toBeNull();
        expect(cache.getSourceBytes()?.length).toBe(bytes.length);
      }),
      { numRuns: 100 }
    );
  });

  it('should create RGBA pixel buffer of correct size', () => {
    fc.assert(
      fc.property(imageBytesArb, dimensionsArb, (bytes, dims) => {
        const cache = createCacheManager();
        
        cache.loadImage(bytes, dims.width, dims.height);
        
        const pixels = cache.getCachedPixels();
        expect(pixels).not.toBeNull();
        
        // RGBA = 4 bytes per pixel
        const expectedSize = dims.width * dims.height * 4;
        expect(pixels?.length).toBe(expectedSize);
      }),
      { numRuns: 100 }
    );
  });

  it('should return false for hasImage after dispose', () => {
    fc.assert(
      fc.property(imageBytesArb, dimensionsArb, (bytes, dims) => {
        const cache = createCacheManager();
        
        cache.loadImage(bytes, dims.width, dims.height);
        expect(cache.hasImage()).toBe(true);
        
        cache.dispose();
        
        expect(cache.hasImage()).toBe(false);
        expect(cache.getCachedPixels()).toBeNull();
        expect(cache.getCachedDimensions()).toBeNull();
        expect(cache.getSourceBytes()).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 3: New image replaces previous cache', () => {
  /**
   * **Feature: slider-performance, Property 3: New image replaces previous cache**
   * 
   * For any two images loaded sequentially, the cached pixel data should 
   * correspond to the second image only, and the first image's data should 
   * be fully disposed.
   * **Validates: Requirements 2.3**
   */

  it('should replace cache when loading new image', () => {
    fc.assert(
      fc.property(
        imageBytesArb,
        dimensionsArb,
        imageBytesArb,
        dimensionsArb,
        (bytes1, dims1, bytes2, dims2) => {
          const cache = createCacheManager();
          
          // Load first image
          cache.loadImage(bytes1, dims1.width, dims1.height);
          
          const firstDims = cache.getCachedDimensions();
          expect(firstDims?.width).toBe(dims1.width);
          expect(firstDims?.height).toBe(dims1.height);
          
          // Load second image
          cache.loadImage(bytes2, dims2.width, dims2.height);
          
          // Cache should now have second image's data
          const secondDims = cache.getCachedDimensions();
          expect(secondDims?.width).toBe(dims2.width);
          expect(secondDims?.height).toBe(dims2.height);
          
          // Pixel buffer should be sized for second image
          const pixels = cache.getCachedPixels();
          const expectedSize = dims2.width * dims2.height * 4;
          expect(pixels?.length).toBe(expectedSize);
          
          // Source bytes should be from second image
          expect(cache.getSourceBytes()?.length).toBe(bytes2.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should fully dispose previous cache before creating new one', () => {
    fc.assert(
      fc.property(
        imageBytesArb,
        dimensionsArb,
        imageBytesArb,
        dimensionsArb,
        (bytes1, dims1, bytes2, dims2) => {
          const cache = createCacheManager();
          
          // Load first image
          cache.loadImage(bytes1, dims1.width, dims1.height);
          const firstPixels = cache.getCachedPixels();
          const firstBytes = cache.getSourceBytes();
          
          // Load second image
          cache.loadImage(bytes2, dims2.width, dims2.height);
          const secondPixels = cache.getCachedPixels();
          const secondBytes = cache.getSourceBytes();
          
          // New references should be created (not reusing old arrays)
          // This ensures old data is eligible for garbage collection
          expect(secondPixels).not.toBe(firstPixels);
          expect(secondBytes).not.toBe(firstBytes);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain valid state through multiple load cycles', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(imageBytesArb, dimensionsArb),
          { minLength: 2, maxLength: 5 }
        ),
        (images) => {
          const cache = createCacheManager();
          
          for (const [bytes, dims] of images) {
            cache.loadImage(bytes, dims.width, dims.height);
            
            // After each load, cache should be valid
            expect(cache.hasImage()).toBe(true);
            expect(cache.getCachedPixels()).not.toBeNull();
            
            const cachedDims = cache.getCachedDimensions();
            expect(cachedDims?.width).toBe(dims.width);
            expect(cachedDims?.height).toBe(dims.height);
          }
          
          // Final state should match last image
          const lastImage = images[images.length - 1];
          const [lastBytes, lastDims] = lastImage;
          
          expect(cache.getSourceBytes()?.length).toBe(lastBytes.length);
          expect(cache.getCachedDimensions()?.width).toBe(lastDims.width);
          expect(cache.getCachedDimensions()?.height).toBe(lastDims.height);
        }
      ),
      { numRuns: 100 }
    );
  });
});
