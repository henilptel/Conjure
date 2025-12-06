'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Droplets,
  Palette,
  Sun,
  Lightbulb,
  Paintbrush,
  Image,
  RotateCw,
  Waves,
  Sparkles,
  Contrast,
  CircleDot,
  Zap,
  Focus,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { getAllToolDefinitions, type ToolDefinition } from '@/lib/tools-registry';
import { glass, glassSubtle, glassInteractive, transitions, iconSize } from '@/lib/design-tokens';
import Slider from '@/app/components/ui/Slider';

// ============================================================================
// Constants
// ============================================================================

const TOOL_ICONS: Record<string, LucideIcon> = {
  blur: Droplets,
  grayscale: Palette,
  contrast: Contrast,
  brightness: Lightbulb,
  saturation: Paintbrush,
  sepia: Image,
  hue: Sun,
  invert: CircleDot,
  sharpen: Zap,
  charcoal: Sparkles,
  edge_detect: Focus,
  rotate: RotateCw,
  wave: Waves,
  solarize: Sun,
  vignette: CircleDot,
};

// Category icons and colors for visual distinction
const CATEGORY_CONFIG: Record<string, { icon: LucideIcon; gradient: string }> = {
  color: { icon: Paintbrush, gradient: 'from-white/15 to-white/5' },
  detail: { icon: Focus, gradient: 'from-white/15 to-white/5' },
  artistic: { icon: Sparkles, gradient: 'from-white/15 to-white/5' },
  geometry: { icon: RotateCw, gradient: 'from-white/15 to-white/5' },
};

const CATEGORIES = [
  { id: 'color', label: 'Color & Light', tools: ['brightness', 'saturation', 'hue', 'contrast', 'invert'] },
  { id: 'detail', label: 'Detail & Texture', tools: ['blur', 'sharpen', 'charcoal', 'edge_detect', 'grayscale'] },
  { id: 'artistic', label: 'Artistic', tools: ['sepia', 'solarize', 'vignette'] },
  { id: 'geometry', label: 'Geometry', tools: ['rotate', 'wave'] },
];

// ============================================================================
// Component
// ============================================================================

export interface ToolBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onToolSelect?: (toolId: string) => void;
  initialCategory?: string | null;
}

export default function ToolBrowser({ isOpen, onClose, onToolSelect, initialCategory }: ToolBrowserProps) {
  const activeTools = useAppStore((state) => state.activeTools);
  const addTool = useAppStore((state) => state.addTool);
  const removeTool = useAppStore((state) => state.removeTool);
  const updateToolValue = useAppStore((state) => state.updateToolValue);
  
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory || 'color');
  
  // Update category when initialCategory changes
  useEffect(() => {
    if (initialCategory && isOpen) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory, isOpen]);
  
  const allTools = getAllToolDefinitions();
  const activeToolIds = new Set(activeTools.map(t => t.id));
  const activeToolsMap = new Map(activeTools.map(t => [t.id, t]));

  const handleToolClick = useCallback((tool: ToolDefinition) => {
    if (activeToolIds.has(tool.id)) {
      setExpandedToolId(expandedToolId === tool.id ? null : tool.id);
    } else {
      addTool([{ name: tool.id }]); // It needs to be name and not id 
      setExpandedToolId(tool.id);
      onToolSelect?.(tool.id);
    }
  }, [activeToolIds, addTool, expandedToolId, onToolSelect]);

  const handleRemoveTool = useCallback((toolId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeTool(toolId);
    if (expandedToolId === toolId) setExpandedToolId(null);
  }, [removeTool, expandedToolId]);

  // Handle slider change - directly updates tool value for WASM processing
  const handleSliderChange = useCallback((toolId: string, value: number) => {
    updateToolValue(toolId, value);
  }, [updateToolValue]);

  // Get tools for active category
  const currentCategory = CATEGORIES.find(c => c.id === activeCategory);
  const categoryTools = currentCategory?.tools
    .map(id => allTools.find(t => t.id === id))
    .filter((t): t is ToolDefinition => t !== undefined) || [];

  // Count active tools per category
  const getActiveCount = (categoryId: string) => {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    return cat?.tools.filter(t => activeToolIds.has(t)).length || 0;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Subtle backdrop - only dims, doesn't block interaction */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
            data-testid="tool-browser-backdrop"
          />
          
          {/* Right side panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={transitions.slideRight}
            className="fixed right-0 top-0 bottom-0 z-50 flex"
            data-testid="tool-browser"
          >
            {/* Category tabs - vertical strip */}
            <div className="flex flex-col justify-center gap-2 p-2">
              {CATEGORIES.map((category) => {
                const config = CATEGORY_CONFIG[category.id];
                const CategoryIcon = config?.icon || Sparkles;
                const isActive = activeCategory === category.id;
                const activeCount = getActiveCount(category.id);
                
                return (
                  <motion.button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative p-3 rounded-xl transition-all duration-200
                               ${isActive 
                                 ? 'bg-white/15 backdrop-blur-xl border border-white/30 shadow-lg' 
                                 : 'bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-white/20'
                               }`}
                    style={isActive ? { boxShadow: glassSubtle.boxShadow } : undefined}
                    aria-label={category.label}
                    data-testid={`category-tab-${category.id}`}
                  >
                    <CategoryIcon 
                      size={iconSize.xl} 
                      className={isActive ? 'text-white' : 'text-zinc-400'} 
                    />
                    {activeCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full 
                                       bg-white/20 backdrop-blur-sm border border-white/30 text-[10px] font-bold text-white
                                       flex items-center justify-center">
                        {activeCount}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Main panel - VisionOS glass with light edges */}
            <div
              className={`relative w-72 h-full ${glass.background} ${glass.blur}
                         border-l border-white/20 flex flex-col overflow-hidden`}
              style={{ boxShadow: glass.boxShadow }}
            >
              {/* Header with top light edge */}
              <div 
                className="p-4 border-b border-white/10"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)'
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <motion.h2 
                    key={activeCategory}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-lg font-semibold text-white"
                  >
                    {currentCategory?.label}
                  </motion.h2>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 
                               hover:text-white transition-colors"
                    aria-label="Close"
                    data-testid="tool-browser-close"
                  >
                    <X size={iconSize.lg} />
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  {activeTools.length} effect{activeTools.length !== 1 ? 's' : ''} active
                </p>
              </div>

              {/* Tools list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {categoryTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    icon={TOOL_ICONS[tool.id] || Sparkles}
                    isActive={activeToolIds.has(tool.id)}
                    isExpanded={expandedToolId === tool.id}
                    currentValue={activeToolsMap.get(tool.id)?.value}
                    onClick={() => handleToolClick(tool)}
                    onRemove={(e) => handleRemoveTool(tool.id, e)}
                    onSliderChange={(value) => handleSliderChange(tool.id, value)}
                  />
                ))}
              </div>

              {/* Quick tip footer */}
              <div className="p-3 border-t border-white/5">
                <p className="text-[10px] text-zinc-600 text-center">
                  Click to add • Tap active effect to adjust
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


// ============================================================================
// ToolCard Sub-component
// ============================================================================

interface ToolCardProps {
  tool: ToolDefinition;
  icon: LucideIcon;
  isActive: boolean;
  isExpanded: boolean;
  currentValue?: number;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onSliderChange: (value: number) => void;
}

function ToolCard({
  tool,
  icon: Icon,
  isActive,
  isExpanded,
  currentValue,
  onClick,
  onRemove,
  onSliderChange,
}: ToolCardProps) {
  const displayValue = currentValue ?? tool.defaultValue;

  const formatValue = (value: number, includeInvert: boolean = true): string => {
    if (tool.id === 'rotate') return `${value}°`;
    if (includeInvert && tool.id === 'invert') return value > 0 ? 'On' : 'Off';
    if (['brightness', 'saturation', 'hue'].includes(tool.id)) return `${value}%`;
    return String(value);
  };

  const createSliderFormatter = () => (value: number): string => formatValue(value, false);

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-150
                 ${isActive
                   ? 'bg-white/10 border border-white/25'
                   : 'bg-white/5 border border-white/[0.08] hover:border-white/15 hover:bg-white/[0.08]'
                 }`}
      style={isActive ? { boxShadow: glassInteractive.activeBoxShadow } : undefined}
      data-testid={`tool-card-${tool.id}`}
    >
      <div
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-3 text-left group cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className={`p-2 rounded-lg transition-colors
                        ${isActive ? 'bg-white/10' : 'bg-white/5 group-hover:bg-white/10'}`}>
          <Icon size={16} className={isActive ? 'text-white' : 'text-zinc-400'} />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-sm block ${isActive ? 'text-white font-medium' : 'text-zinc-300'}`}>
            {tool.label}
          </span>
          {isActive && (
            <span className="text-xs text-zinc-400">{formatValue(displayValue)}</span>
          )}
        </div>
        {isActive ? (
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 
                       hover:text-red-400 transition-colors"
            aria-label={`Remove ${tool.label}`}
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
        )}
      </div>

      {isActive && isExpanded && (
        <div className="px-3 pb-3">
          <Slider
            value={displayValue}
            min={tool.min}
            max={tool.max}
            onChange={onSliderChange}
            label={tool.label}
            id={`browser-slider-${tool.id}`}
            defaultValue={tool.defaultValue}
            formatValue={createSliderFormatter(tool.id)}
          />
        </div>
      )}
    </div>
  );
}
