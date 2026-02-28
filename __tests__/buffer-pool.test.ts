/**
 * Tests for buffer-pool.ts - Zero-copy buffer management
 */

import {
  BufferPool,
  getBufferPool,
  resetBufferPool,
  isSharedArrayBufferSupported,
  cloneIfNeeded,
  transferOwnership,
} from '../lib/buffer-pool';

describe('isSharedArrayBufferSupported', () => {
  it('returns a boolean', () => {
    const result = isSharedArrayBufferSupported();
    expect(typeof result).toBe('boolean');
  });
});

describe('BufferPool', () => {
  let pool: BufferPool;

  beforeEach(() => {
    pool = new BufferPool({
      maxPoolSize: 10 * 1024 * 1024, // 10MB for tests
      maxBufferCount: 4,
      idleTimeoutMs: 60000,
    });
  });

  afterEach(() => {
    pool.dispose();
  });

  describe('acquire', () => {
    it('returns a view of the requested size', () => {
      const { view, release } = pool.acquire(1024);
      
      expect(view).toBeInstanceOf(Uint8Array);
      expect(view.byteLength).toBe(1024);
      
      release();
    });

    it('reuses released buffers', () => {
      const { view: view1, release: release1 } = pool.acquire(1024);
      const buffer1 = view1.buffer;
      release1();

      const { view: view2, release: release2 } = pool.acquire(1024);
      const buffer2 = view2.buffer;
      release2();

      // Should reuse the same underlying buffer
      expect(buffer1).toBe(buffer2);
    });

    it('allocates new buffer when existing ones are too small', () => {
      const { view: view1, release: release1 } = pool.acquire(1024);
      release1();

      const { view: view2, release: release2 } = pool.acquire(2048);
      
      // Should allocate new buffer since 1024 < 2048
      expect(view2.byteLength).toBe(2048);
      release2();
    });

    it('tracks buffer count correctly', () => {
      expect(pool.getBufferCount()).toBe(0);

      const { release: r1 } = pool.acquire(1024);
      expect(pool.getBufferCount()).toBe(1);

      const { release: r2 } = pool.acquire(2048);
      expect(pool.getBufferCount()).toBe(2);

      r1();
      r2();
      expect(pool.getBufferCount()).toBe(2); // Still in pool
    });

    it('tracks active buffer count correctly', () => {
      expect(pool.getActiveBufferCount()).toBe(0);

      const { release: r1 } = pool.acquire(1024);
      expect(pool.getActiveBufferCount()).toBe(1);

      const { release: r2 } = pool.acquire(2048);
      expect(pool.getActiveBufferCount()).toBe(2);

      r1();
      expect(pool.getActiveBufferCount()).toBe(1);

      r2();
      expect(pool.getActiveBufferCount()).toBe(0);
    });
  });

  describe('acquireWithData', () => {
    it('copies source data into the buffer', () => {
      const source = new Uint8Array([1, 2, 3, 4, 5]);
      const { view, release } = pool.acquireWithData(source);

      expect(view.byteLength).toBe(5);
      expect(Array.from(view)).toEqual([1, 2, 3, 4, 5]);

      release();
    });

    it('does not share buffer with source', () => {
      const source = new Uint8Array([1, 2, 3, 4, 5]);
      const { view, release } = pool.acquireWithData(source);

      // Modify source
      source[0] = 99;

      // View should be unchanged
      expect(view[0]).toBe(1);

      release();
    });
  });

  describe('tryGetView', () => {
    it('returns view info for pooled buffer', () => {
      const { view, release } = pool.acquire(1024);
      
      const result = pool.tryGetView(view);
      expect(result).not.toBeNull();
      expect(result?.view.buffer).toBe(view.buffer);

      release();
    });

    it('returns null for non-pooled buffer', () => {
      const external = new Uint8Array(1024);
      const result = pool.tryGetView(external);
      expect(result).toBeNull();
    });
  });

  describe('memory limits', () => {
    it('evicts old buffers when pool size exceeded', () => {
      const pool = new BufferPool({
        maxPoolSize: 3000, // 3KB
        maxBufferCount: 10,
        idleTimeoutMs: 60000,
      });

      // Allocate 3 x 1KB buffers
      const { release: r1 } = pool.acquire(1000);
      const { release: r2 } = pool.acquire(1000);
      const { release: r3 } = pool.acquire(1000);

      r1();
      r2();
      r3();

      expect(pool.getBufferCount()).toBe(3);

      // Allocate another 1KB - should evict oldest
      const { release: r4 } = pool.acquire(1000);
      r4();

      // Should have evicted at least one buffer
      expect(pool.getTotalPoolSize()).toBeLessThanOrEqual(3000);

      pool.dispose();
    });

    it('evicts buffers when count exceeded', () => {
      const pool = new BufferPool({
        maxPoolSize: 100 * 1024 * 1024, // 100MB
        maxBufferCount: 2,
        idleTimeoutMs: 60000,
      });

      const { release: r1 } = pool.acquire(100);
      const { release: r2 } = pool.acquire(100);
      r1();
      r2();

      expect(pool.getBufferCount()).toBe(2);

      // Allocate third buffer - should evict oldest
      const { release: r3 } = pool.acquire(100);
      r3();

      expect(pool.getBufferCount()).toBeLessThanOrEqual(2);

      pool.dispose();
    });
  });

  describe('dispose', () => {
    it('clears all buffers', () => {
      pool.acquire(1024);
      pool.acquire(2048);

      expect(pool.getBufferCount()).toBe(2);

      pool.dispose();

      expect(pool.getBufferCount()).toBe(0);
      expect(pool.getTotalPoolSize()).toBe(0);
    });
  });

  describe('warmPool', () => {
    it('pre-allocates buffers of specified sizes', () => {
      expect(pool.getBufferCount()).toBe(0);

      pool.warmPool([1024, 2048, 4096]);

      expect(pool.getBufferCount()).toBe(3);
      expect(pool.getTotalPoolSize()).toBe(1024 + 2048 + 4096);
      expect(pool.getActiveBufferCount()).toBe(0); // Not in use
    });

    it('skips duplicate sizes', () => {
      pool.warmPool([1024, 1024, 1024]);

      // Should only create one buffer of size 1024
      expect(pool.getBufferCount()).toBe(1);
    });

    it('respects maxPoolSize limit', () => {
      const smallPool = new BufferPool({
        maxPoolSize: 5000,
        maxBufferCount: 10,
      });

      smallPool.warmPool([2000, 2000, 2000]); // Would be 6000, exceeds 5000

      expect(smallPool.getTotalPoolSize()).toBeLessThanOrEqual(5000);

      smallPool.dispose();
    });

    it('respects maxBufferCount limit', () => {
      const limitedPool = new BufferPool({
        maxPoolSize: 100 * 1024 * 1024,
        maxBufferCount: 2,
      });

      limitedPool.warmPool([100, 200, 300]); // Would be 3 buffers, limit is 2

      expect(limitedPool.getBufferCount()).toBeLessThanOrEqual(2);

      limitedPool.dispose();
    });

    it('warmed buffers are reused on acquire', () => {
      pool.warmPool([1024]);
      
      const { view, release } = pool.acquire(1024);
      
      // Should reuse the warmed buffer, not allocate new
      expect(pool.getBufferCount()).toBe(1);
      expect(view.byteLength).toBe(1024);
      
      release();
    });
  });
});

describe('getBufferPool / resetBufferPool', () => {
  afterEach(() => {
    resetBufferPool();
  });

  it('returns the same instance on multiple calls', () => {
    const pool1 = getBufferPool();
    const pool2 = getBufferPool();
    expect(pool1).toBe(pool2);
  });

  it('returns new instance after reset', () => {
    const pool1 = getBufferPool();
    resetBufferPool();
    const pool2 = getBufferPool();
    expect(pool1).not.toBe(pool2);
  });
});

describe('cloneIfNeeded', () => {
  it('returns same reference for regular ArrayBuffer when not forced', () => {
    const source = new Uint8Array([1, 2, 3]);
    const result = cloneIfNeeded(source, false);
    
    // Should be same reference (no copy)
    expect(result.buffer).toBe(source.buffer);
  });

  it('returns copy when forced', () => {
    const source = new Uint8Array([1, 2, 3]);
    const result = cloneIfNeeded(source, true);
    
    // Should be different buffer
    expect(result.buffer).not.toBe(source.buffer);
    // But same content
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });
});

describe('transferOwnership', () => {
  it('creates new Uint8Array with copied buffer', () => {
    const source = new Uint8Array([1, 2, 3, 4, 5]);
    const result = transferOwnership(source);

    // Should have same content
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
    
    // Should be different buffer
    expect(result.buffer).not.toBe(source.buffer);
  });

  it('handles views into larger buffers', () => {
    const buffer = new ArrayBuffer(100);
    const view = new Uint8Array(buffer, 10, 5);
    view.set([1, 2, 3, 4, 5]);

    const result = transferOwnership(view);

    expect(result.byteLength).toBe(5);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });
});
