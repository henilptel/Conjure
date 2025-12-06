'use client';

import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  X,
  Layers,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { getToolConfig, getToolIcon } from '@/lib/tools-registry';
import { glassSubtle, glass, iconSize, magneticButton } from '@/lib/design-tokens';
import Slider from '@/app/components/ui/Slider';

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
function ActiveToolsPanelComponent({ disabled = false, onToolSelect }: ActiveToolsPanelProps) {
  const activeTools = useAppStore((state) => state.activeTools);
  const updateToolValue = useAppStore((state) => state.updateToolValue);
  const removeTool = useAppStore((state) => state.removeTool);
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  // Handle slider change - directly updates tool value for WASM processing
  const handleSliderChange = useCallback((toolId: string, value: number) => {
    updateToolValue(toolId, value);
  }, [updateToolValue]);

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

  // Group active tools by category
  const groupedTools = Object.entries(TOOL_CATEGORIES).map(([categoryId, category]) => ({
    categoryId,
    label: category.label,
    tools: activeTools.filter(tool => category.tools.includes(tool.id)),
  })).filter(group => group.tools.length > 0);

  // Tools that don't fit any category
  const allCategorizedTools = Object.values(TOOL_CATEGORIES).flatMap(c => c.tools);
  const uncategorizedTools = activeTools.filter(tool => !allCategorizedTools.includes(tool.id));

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
                   ${glassSubtle.background} ${glassSubtle.blur} ${glassSubtle.border}
                   text-white hover:bg-white/15
                   ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ boxShadow: glassSubtle.boxShadow }}
        disabled={disabled}
        whileHover={magneticButton.whileHover}
        whileTap={magneticButton.whileTap}
        transition={magneticButton.transition}
        data-testid="active-tools-toggle"
      >
        <Layers size={iconSize.lg} />
        <span className="text-sm font-medium">{activeTools.length}</span>
        {isExpanded ? <ChevronUp size={iconSize.md} /> : <ChevronDown size={iconSize.md} />}
      </motion.button>

      {/* Expanded panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className={`${glass.background} ${glass.blur} ${glass.border} rounded-2xl
                       overflow-hidden max-h-[60vh] overflow-y-auto glass-scroll`}
            style={{ boxShadow: glass.boxShadow }}
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
                      icon={getToolIcon(tool.id) || Sparkles}
                      isExpanded={expandedToolId === tool.id}
                      disabled={disabled}
                      onClick={() => handleToolClick(tool.id)}
                      onRemove={(e) => handleRemoveTool(tool.id, e)}
                      onSliderChange={(value) => handleSliderChange(tool.id, value)}
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
                      icon={getToolIcon(tool.id) || Sparkles}
                      isExpanded={expandedToolId === tool.id}
                      disabled={disabled}
                      onClick={() => handleToolClick(tool.id)}
                      onRemove={(e) => handleRemoveTool(tool.id, e)}
                      onSliderChange={(value) => handleSliderChange(tool.id, value)}
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

// Export memoized version to prevent re-renders when props are unchanged
export default memo(ActiveToolsPanelComponent);


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
}

const formatValue = (value: number, toolId: string): string => {
  if (toolId === 'rotate') return `${value}°`;
  if (toolId === 'invert') return value > 0 ? 'On' : 'Off';
  if (['brightness', 'saturation', 'hue'].includes(toolId)) {
    return `${value}%`;
  }
  return String(value);
};

/**
 * Creates a format function for slider display based on tool ID
 */
const createSliderFormatter = (toolId: string) => (value: number): string => {
  if (toolId === 'rotate') return `${value}°`;
  if (['brightness', 'saturation', 'hue'].includes(toolId)) return `${value}%`;
  return String(value);
};

const ToolItem = memo(function ToolItem({
  tool,
  icon: Icon,
  isExpanded,
  disabled,
  onClick,
  onRemove,
  onSliderChange,
}: ToolItemProps) {
  const toolConfig = getToolConfig(tool.id);
  const isAtDefault = toolConfig && tool.value === toolConfig.defaultValue;

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
        <Icon size={iconSize.md} className="text-zinc-400 flex-shrink-0" />
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
          <X size={iconSize.sm} />
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
                label={tool.label}
                disabled={disabled}
                id={`panel-slider-${tool.id}`}
                defaultValue={toolConfig?.defaultValue}
                formatValue={createSliderFormatter(tool.id)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
