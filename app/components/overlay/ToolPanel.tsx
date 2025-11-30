'use client';

import { X } from 'lucide-react';
import Slider from '../ui/Slider';
import type { ActiveTool } from '@/lib/types';

export interface ToolPanelProps {
  tools: ActiveTool[];
  onToolUpdate: (id: string, value: number) => void;
  onToolRemove: (id: string) => void;
  disabled?: boolean;
}

/**
 * A glassmorphism-styled floating panel that renders tool sliders.
 * Positioned at bottom-center of the parent container.
 * Returns null when tools array is empty.
 */
export default function ToolPanel({
  tools,
  onToolUpdate,
  onToolRemove,
  disabled = false,
}: ToolPanelProps) {
  // Return null when tools array is empty (Requirement 2.4)
  if (tools.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 
                 bg-white/80 backdrop-blur-md rounded-xl shadow-lg 
                 p-4 min-w-[280px] max-w-[400px]"
      data-testid="tool-panel"
    >
      <div className="flex flex-col gap-4">
        {tools.map((tool) => (
          <div key={tool.id} className="flex items-center gap-2">
            <div className="flex-1">
              <Slider
                id={`tool-slider-${tool.id}`}
                label={tool.label}
                value={tool.value}
                min={tool.min}
                max={tool.max}
                onChange={(value) => onToolUpdate(tool.id, value)}
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              onClick={() => onToolRemove(tool.id)}
              className="p-1 rounded-full hover:bg-zinc-200/80 
                         transition-colors text-zinc-500 hover:text-zinc-700"
              aria-label={`Remove ${tool.label} tool`}
              data-testid={`remove-tool-${tool.id}`}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
