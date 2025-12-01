'use client';

import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  X,
  Layers,
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
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { getToolConfig } from '@/lib/tools-registry';
import Slider from '@/app/components/ui/Slider';

// ============================================================================
// Types & Constants
// ============================================================================

/**
 * Tool icon mapping - maps tool IDs to their icons
 */
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

/**
 * Tool categories for grouping
 */
const TOOL_CATEGORIES: Record<string, { label: string; tools: string[] }> = {
  color: {
    label: 'Color & Light',
    tools: ['brightness', 'saturation', 'hue', 'contrast', 'invert'],
  },
  detail: {
    label: 'Detail & Texture',
    tools: ['blur', 'sharpen', 'charcoal', 'edge_detect', 'grayscale'],
  },
  artistic: {
    label: 'Artistic',
    tools: ['sepia', 'solarize', 'vignette'],
  },
  geometry: {
    label: 'Geometry',
    tools: ['rotate', 'wave'],
  },
};

// ============================================================================
// Component
// ============================================================================

export interface ActiveToolsPanelProps {
  disabled?: boolean;
  onToolSelect?: (toolId: string) => void;
}

/**
 * ActiveToolsPanel - Shows all currently active tools with quick access
 * 
 * Features:
 * - Collapsible panel showing active tool count
 * - Inline sliders for quick adjustments
 * - Remove button for each tool
 * - Grouped by category when expanded
 */
export default function ActiveToolsPanel({ disabled = false, onToolSelect }: ActiveToolsPanelProps) {
  const activeTools = useAppStore((state) => state.activeTools);
  const updateToolValue = useAppStore((state) => state.updateToolValue);
  const removeTool = useAppStore((state) => state.removeTool);
  const previewState = useAppStore((state) => state.previewState);
  const startPreview = useAppStore((state) => state.startPreview);
  const updatePreviewValue = useAppStore((state) => state.updatePreviewValue);
  const commitPreview = useAppStore((state) => state.commitPreview);
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  // Use preview values during drag, otherwise committed values
  const displayTools = previewState.isDragging ? previewState.previewTools : activeTools;

  // Handle slider change during drag - updates preview state for CSS filter preview
  const handleSliderChange = useCallback((toolId: string, value: number) => {
    if (!previewState.isDragging) {
      // Start preview mode if not already dragging
      startPreview(toolId);
    }
    // Update preview value (CSS filters will update instantly)
    updatePreviewValue(toolId, value);
  }, [previewState.isDragging, startPreview, updatePreviewValue]);

  // Handle slider commit on pointer release - triggers WASM processing
  const handleSliderCommit = useCallback((toolId: string, value: number) => {
    // Update the actual tool value
    updateToolValue(toolId, value);
    // Commit preview (clears preview state, activeTools change triggers WASM)
    commitPreview();
  }, [updateToolValue, commitPreview]);

  const handleRemoveTool = useCallback((toolId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeTool(toolId);
    if (expandedToolId === toolId) {
      setExpandedToolId(null);
    }
  }, [removeTool, expandedToolId]);

  const handleToolClick = useCallback((toolId: string) => {
    if (expandedToolId === toolId) {
      setExpandedToolId(null);
    } else {
      setExpandedToolId(toolId);
      onToolSelect?.(toolId);
    }
  }, [expandedToolId, onToolSelect]);

  // Don't render if no active tools
  if (activeTools.length === 0) {
    return null;
  }

  // Group active tools by category (use displayTools for preview values)
  const groupedTools = Object.entries(TOOL_CATEGORIES).map(([categoryId, category]) => ({
    categoryId,
    label: category.label,
    tools: displayTools.filter(tool => category.tools.includes(tool.id)),
  })).filter(group => group.tools.length > 0);

  // Tools that don't fit any category
  const allCategorizedTools = Object.values(TOOL_CATEGORIES).flatMap(c => c.tools);
  const uncategorizedTools = displayTools.filter(tool => !allCategorizedTools.includes(tool.id));

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="fixed left-4 top-1/2 -translate-y-1/2 z-30"
      data-testid="active-tools-panel"
    >
      {/* Collapsed state - just shows count badge */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-2 rounded-full
                   bg-white/10 backdrop-blur-2xl backdrop-saturate-150 border border-white/20
                   text-white hover:bg-white/15 transition-colors
                   ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={disabled}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        data-testid="active-tools-toggle"
      >
        <Layers size={18} />
        <span className="text-sm font-medium">{activeTools.length}</span>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </motion.button>

      {/* Expanded panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="bg-white/10 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 rounded-2xl
                       overflow-hidden max-h-[60vh] overflow-y-auto"
            data-testid="active-tools-list"
          >
            <div className="p-3 space-y-3 min-w-[240px]">
              {/* Header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-zinc-400 uppercase tracking-wider">
                  Active Effects
                </span>
                <span className="text-xs text-zinc-500">
                  {activeTools.length} applied
                </span>
              </div>

              {/* Grouped tools */}
              {groupedTools.map(({ categoryId, label, tools }) => (
                <div key={categoryId} className="space-y-1">
                  <div className="text-xs text-zinc-500 px-1">{label}</div>
                  {tools.map(tool => (
                    <ToolItem
                      key={tool.id}
                      tool={tool}
                      icon={TOOL_ICONS[tool.id] || Sparkles}
                      isExpanded={expandedToolId === tool.id}
                      disabled={disabled}
                      onClick={() => handleToolClick(tool.id)}
                      onRemove={(e) => handleRemoveTool(tool.id, e)}
                      onSliderChange={(value) => handleSliderChange(tool.id, value)}
                      onSliderCommit={(value) => handleSliderCommit(tool.id, value)}
                    />
                  ))}
                </div>
              ))}

              {/* Uncategorized tools */}
              {uncategorizedTools.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500 px-1">Other</div>
                  {uncategorizedTools.map(tool => (
                    <ToolItem
                      key={tool.id}
                      tool={tool}
                      icon={TOOL_ICONS[tool.id] || Sparkles}
                      isExpanded={expandedToolId === tool.id}
                      disabled={disabled}
                      onClick={() => handleToolClick(tool.id)}
                      onRemove={(e) => handleRemoveTool(tool.id, e)}
                      onSliderChange={(value) => handleSliderChange(tool.id, value)}
                      onSliderCommit={(value) => handleSliderCommit(tool.id, value)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


// ============================================================================
// ToolItem Sub-component
// ============================================================================

interface ToolItemProps {
  tool: { id: string; label: string; value: number; min: number; max: number };
  icon: LucideIcon;
  isExpanded: boolean;
  disabled: boolean;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onSliderChange: (value: number) => void;
  onSliderCommit: (value: number) => void;
}

const ToolItem = memo(function ToolItem({
  tool,
  icon: Icon,
  isExpanded,
  disabled,
  onClick,
  onRemove,
  onSliderChange,
  onSliderCommit,
}: ToolItemProps) {
  const toolConfig = getToolConfig(tool.id);
  const isAtDefault = toolConfig && tool.value === toolConfig.defaultValue;
  
  // Format value for display
  const formatValue = (value: number, toolId: string): string => {
    // Special formatting for certain tools
    if (toolId === 'rotate') return `${value}°`;
    if (toolId === 'invert') return value > 0 ? 'On' : 'Off';
    if (['brightness', 'saturation', 'hue'].includes(toolId)) {
      return `${value}%`;
    }
    return String(value);
  };

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Tool header row */}
      <div
        onClick={disabled ? undefined : onClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                   hover:bg-white/5 transition-colors text-left cursor-pointer
                   ${isExpanded ? 'bg-white/10' : ''}
                   ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        data-testid={`tool-item-${tool.id}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <Icon size={16} className="text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-white flex-1 truncate">{tool.label}</span>
        <span className={`text-xs ${isAtDefault ? 'text-zinc-500' : 'text-zinc-300'}`}>
          {formatValue(tool.value, tool.id)}
        </span>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400
                     transition-colors flex-shrink-0"
          aria-label={`Remove ${tool.label}`}
          data-testid={`remove-tool-${tool.id}`}
        >
          <X size={14} />
        </button>
      </div>

      {/* Expanded slider */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 pt-1">
              <Slider
                value={tool.value}
                min={tool.min}
                max={tool.max}
                onChange={onSliderChange}
                onCommit={onSliderCommit}
                label={tool.label}
                disabled={disabled}
                id={`panel-slider-${tool.id}`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
