'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, X, Cpu, HardDrive, Image, Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, MAX_MEMORY_BUDGET_BYTES, MemoryUsageInfo } from '@/lib/memory-management';
import { MAX_PROCESSING_DIMENSION, MAX_IMAGE_DIMENSION } from '@/lib/validation';
import { glassSubtle, glass, iconSize } from '@/lib/design-tokens';

/**
 * Extended memory stats including browser performance metrics
 */
export interface MemoryStatsData {
  // Image engine stats
  engineStats: {
    sourceBytesSize: number;
    cachedPixelsSize: number;
    processedResultSize: number;
    canvasRenderCacheSize: number;
    totalSize: number;
    budgetUsagePercent: number;
  } | null;
  
  // Image info
  imageInfo: {
    originalWidth: number;
    originalHeight: number;
    processingWidth: number;
    processingHeight: number;
    wasDownscaled: boolean;
    loadScale: number;
  } | null;
  
  // Processing stats
  processingStats: {
    lastProcessingTimeMs: number;
    avgProcessingTimeMs: number;
    processCount: number;
    isWorkerActive: boolean;
  };
  
  // Browser memory (if available)
  browserMemory: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | null;
  
  // Performance metrics
  performanceMetrics: {
    fps: number;
    frameTime: number;
  };
}

interface MemoryStatsProps {
  /** Function to get current memory stats from ImageEngine */
  getEngineStats?: () => MemoryUsageInfo | null;
  /** Function to get image info from ImageEngine */
  getImageInfo?: () => {
    originalWidth: number;
    originalHeight: number;
    processingWidth: number;
    processingHeight: number;
    wasDownscaled: boolean;
    loadScale: number;
  } | null;
  /** Last processing time in ms */
  lastProcessingTime?: number;
  /** Whether worker is active */
  isWorkerActive?: boolean;
  /** Keyboard shortcut to toggle (default: 'i') */
  toggleKey?: string;
}

/**
 * Stats for Nerds - Developer memory diagnostics panel
 * 
 * Shows real-time memory usage, image processing stats, and browser performance metrics.
 * Toggle with keyboard shortcut (default: Shift+I) or click the activity icon.
 */
export default function MemoryStats({
  getEngineStats,
  getImageInfo,
  lastProcessingTime = 0,
  isWorkerActive = false,
  toggleKey = 'i',
}: MemoryStatsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<MemoryStatsData>({
    engineStats: null,
    imageInfo: null,
    processingStats: {
      lastProcessingTimeMs: 0,
      avgProcessingTimeMs: 0,
      processCount: 0,
      isWorkerActive: false,
    },
    browserMemory: null,
    performanceMetrics: {
      fps: 0,
      frameTime: 0,
    },
  });
  
  // FPS tracking
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const rafIdRef = useRef<number>(0);
  
  // Processing time tracking
  const processingTimesRef = useRef<number[]>([]);
  
  // Refs for stable function references to prevent effect re-runs
  const getEngineStatsRef = useRef(getEngineStats);
  const getImageInfoRef = useRef(getImageInfo);
  
  // Sync refs to latest function props (no dependencies to avoid re-triggering effects)
  useEffect(() => {
    getEngineStatsRef.current = getEngineStats;
    getImageInfoRef.current = getImageInfo;
  });
  
  // Update processing stats when lastProcessingTime changes
  useEffect(() => {
    if (lastProcessingTime > 0) {
      processingTimesRef.current.push(lastProcessingTime);
      // Keep last 20 samples
      if (processingTimesRef.current.length > 20) {
        processingTimesRef.current.shift();
      }
    }
  }, [lastProcessingTime]);
  
  // FPS calculation loop
  useEffect(() => {
    if (!isOpen) return;
    
    const measureFPS = () => {
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      
      frameTimesRef.current.push(delta);
      // Keep last 60 samples (1 second at 60fps)
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }
      
      rafIdRef.current = requestAnimationFrame(measureFPS);
    };
    
    rafIdRef.current = requestAnimationFrame(measureFPS);
    
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [isOpen]);
  
  // Update stats periodically when panel is open
  useEffect(() => {
    if (!isOpen) return;
    
    const updateStats = () => {
      // Get engine stats using ref to avoid effect re-runs
      const engineStats = getEngineStatsRef.current?.() ?? null;
      
      // Get image info using ref to avoid effect re-runs
      const imageInfo = getImageInfoRef.current?.() ?? null;
      
      // Calculate average processing time
      const avgProcessingTime = processingTimesRef.current.length > 0
        ? processingTimesRef.current.reduce((a, b) => a + b, 0) / processingTimesRef.current.length
        : 0;
      
      // Calculate FPS
      const avgFrameTime = frameTimesRef.current.length > 0
        ? frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
        : 16.67;
      const fps = 1000 / avgFrameTime;
      
      // Get browser memory if available
      let browserMemory: MemoryStatsData['browserMemory'] = null;
      if ('memory' in performance) {
        const mem = (performance as Performance & { memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        } }).memory;
        if (mem) {
          browserMemory = {
            usedJSHeapSize: mem.usedJSHeapSize,
            totalJSHeapSize: mem.totalJSHeapSize,
            jsHeapSizeLimit: mem.jsHeapSizeLimit,
          };
        }
      }
      
      setStats({
        engineStats: engineStats ? {
          sourceBytesSize: engineStats.sourceBytesSize,
          cachedPixelsSize: engineStats.cachedPixelsSize,
          processedResultSize: engineStats.processedResultSize,
          canvasRenderCacheSize: engineStats.canvasRenderCacheSize,
          totalSize: engineStats.totalSize,
          budgetUsagePercent: engineStats.budgetUsagePercent,
        } : null,
        imageInfo,
        processingStats: {
          lastProcessingTimeMs: lastProcessingTime,
          avgProcessingTimeMs: avgProcessingTime,
          processCount: processingTimesRef.current.length,
          isWorkerActive,
        },
        browserMemory,
        performanceMetrics: {
          fps: Math.round(fps),
          frameTime: avgFrameTime,
        },
      });
    };
    
    // Update immediately and then every 500ms
    updateStats();
    const intervalId = setInterval(updateStats, 500);
    
    return () => clearInterval(intervalId);
  }, [isOpen, lastProcessingTime, isWorkerActive]);
  
  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift + toggleKey to toggle panel
      if (e.shiftKey && e.key.toLowerCase() === toggleKey.toLowerCase()) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleKey]);
  
  const getBudgetColor = (percent: number) => {
    if (percent < 50) return 'text-green-400';
    if (percent < 80) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const getProgressColor = (percent: number) => {
    if (percent < 50) return 'bg-green-500';
    if (percent < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <>
      {/* Toggle Button - positioned in top-right */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          "fixed top-4 right-4 z-30 p-2 rounded-full",
          glassSubtle.background, glassSubtle.blur, glassSubtle.border,
          "hover:bg-white/15 transition-colors",
          "text-zinc-400 hover:text-zinc-200",
          isOpen && "text-green-400 border-green-500/30 bg-white/15"
        )}
        style={{ boxShadow: glassSubtle.boxShadow }}
        title={`Stats for Nerds (Shift+${toggleKey.toUpperCase()})`}
      >
        <Activity className="w-4 h-4" />
      </button>
      
      {/* Stats Panel - positioned below toggle, height limited to effects button */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "fixed top-14 right-4 z-30",
              "w-72 max-h-[calc(50vh-6rem)] flex flex-col",
              glass.background, glass.blur, glass.border,
              "rounded-2xl",
              "font-mono text-xs"
            )}
            style={{ boxShadow: glass.boxShadow }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/15">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-green-400" />
                <span className="text-zinc-200 font-semibold text-sm">Stats for Nerds</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-3 space-y-4 glass-scroll">
                {/* Performance Metrics */}
                <Section title="Performance" icon={<Zap className="w-3 h-3" />}>
                  <StatRow label="FPS" value={`${stats.performanceMetrics.fps}`} />
                  <StatRow label="Frame Time" value={`${stats.performanceMetrics.frameTime.toFixed(1)}ms`} />
                  <StatRow 
                    label="Last Process" 
                    value={`${stats.processingStats.lastProcessingTimeMs.toFixed(0)}ms`}
                    highlight={stats.processingStats.lastProcessingTimeMs > 100}
                  />
                  <StatRow 
                    label="Avg Process" 
                    value={`${stats.processingStats.avgProcessingTimeMs.toFixed(0)}ms`}
                  />
                  <StatRow 
                    label="Worker" 
                    value={stats.processingStats.isWorkerActive ? 'Active' : 'Inactive'}
                    valueClass={stats.processingStats.isWorkerActive ? 'text-green-400' : 'text-zinc-500'}
                  />
                </Section>
                
                {/* Image Info */}
                {stats.imageInfo && (
                  <Section title="Image" icon={<Image className="w-3 h-3" />}>
                    <StatRow 
                      label="Original" 
                      value={`${stats.imageInfo.originalWidth}×${stats.imageInfo.originalHeight}`}
                    />
                    <StatRow 
                      label="Processing" 
                      value={`${stats.imageInfo.processingWidth}×${stats.imageInfo.processingHeight}`}
                    />
                    {stats.imageInfo.wasDownscaled && (
                      <StatRow 
                        label="Scale" 
                        value={`${(stats.imageInfo.loadScale * 100).toFixed(0)}%`}
                        valueClass="text-yellow-400"
                      />
                    )}
                    <StatRow 
                      label="Megapixels" 
                      value={`${((stats.imageInfo.processingWidth * stats.imageInfo.processingHeight) / 1_000_000).toFixed(1)}MP`}
                    />
                  </Section>
                )}
                
                {/* Memory Usage */}
                <Section title="Memory (Engine)" icon={<HardDrive className="w-3 h-3" />}>
                  {stats.engineStats ? (
                    <>
                      {/* Progress bar */}
                      <div className="mb-2">
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-500">Budget Usage</span>
                          <span className={getBudgetColor(stats.engineStats.budgetUsagePercent)}>
                            {stats.engineStats.budgetUsagePercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all", getProgressColor(stats.engineStats.budgetUsagePercent))}
                            style={{ width: `${Math.min(stats.engineStats.budgetUsagePercent, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      <StatRow label="Source Bytes" value={formatBytes(stats.engineStats.sourceBytesSize)} />
                      <StatRow label="Cached Pixels" value={formatBytes(stats.engineStats.cachedPixelsSize)} />
                      <StatRow label="Processed Result" value={formatBytes(stats.engineStats.processedResultSize)} />
                      <StatRow label="Canvas Cache" value={formatBytes(stats.engineStats.canvasRenderCacheSize)} />
                      <div className="border-t border-zinc-700/50 mt-2 pt-2">
                        <StatRow 
                          label="Total" 
                          value={formatBytes(stats.engineStats.totalSize)}
                          valueClass="text-white font-semibold"
                        />
                        <StatRow 
                          label="Budget" 
                          value={formatBytes(MAX_MEMORY_BUDGET_BYTES)}
                          valueClass="text-zinc-500"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="text-zinc-500 text-center py-2">No image loaded</div>
                  )}
                </Section>
                
                {/* Browser Memory (Chrome only) */}
                {stats.browserMemory && (
                  <Section title="Memory (Browser)" icon={<HardDrive className="w-3 h-3" />}>
                    <StatRow label="JS Heap Used" value={formatBytes(stats.browserMemory.usedJSHeapSize)} />
                    <StatRow label="JS Heap Total" value={formatBytes(stats.browserMemory.totalJSHeapSize)} />
                    <StatRow label="Heap Limit" value={formatBytes(stats.browserMemory.jsHeapSizeLimit)} />
                    <div className="mt-2">
                      <div className="flex justify-between mb-1">
                        <span className="text-zinc-500">Heap Usage</span>
                        <span className={getBudgetColor((stats.browserMemory.usedJSHeapSize / stats.browserMemory.jsHeapSizeLimit) * 100)}>
                          {((stats.browserMemory.usedJSHeapSize / stats.browserMemory.jsHeapSizeLimit) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all",
                            getProgressColor((stats.browserMemory.usedJSHeapSize / stats.browserMemory.jsHeapSizeLimit) * 100)
                          )}
                          style={{ width: `${(stats.browserMemory.usedJSHeapSize / stats.browserMemory.jsHeapSizeLimit) * 100}%` }}
                        />
                      </div>
                    </div>
                  </Section>
                )}
                
                {/* Limits */}
                <Section title="Limits" icon={<Clock className="w-3 h-3" />}>
                  <StatRow label="Max Dimension" value={`${MAX_IMAGE_DIMENSION}px`} />
                  <StatRow label="Process Dimension" value={`${MAX_PROCESSING_DIMENSION}px`} />
                  <StatRow label="Memory Budget" value={formatBytes(MAX_MEMORY_BUDGET_BYTES)} />
                </Section>
                
                {/* Footer */}
                <div className="text-center text-zinc-600 text-[10px] pt-2 border-t border-zinc-700/50">
                  Press Shift+{toggleKey.toUpperCase()} to toggle
                </div>
              </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Helper Components

function Section({ 
  title, 
  icon, 
  children 
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-zinc-400">
        {icon}
        <span className="uppercase tracking-wider text-[10px] font-semibold">{title}</span>
      </div>
      <div className="space-y-1 pl-1">
        {children}
      </div>
    </div>
  );
}

function StatRow({ 
  label, 
  value, 
  valueClass = 'text-zinc-200',
  highlight = false,
}: { 
  label: string; 
  value: string;
  valueClass?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-zinc-500">{label}</span>
      <span className={cn(
        valueClass,
        highlight && 'text-red-400'
      )}>
        {value}
      </span>
    </div>
  );
}
