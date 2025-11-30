'use client';

import { memo } from 'react';
import { Handle, Position, Node } from '@xyflow/react';
import Slider from '../ui/Slider';
import { useAppStore } from '@/lib/store';
import { ToolNodeData } from '@/lib/graph-utils';

/**
 * Props for ToolNode component
 */
interface ToolNodeProps {
  id: string;
  data: ToolNodeData;
  selected: boolean;
}

/**
 * Custom React Flow node component for tool nodes.
 * Displays a glassmorphism-styled node with a slider control inside.
 * 
 * Requirements: 1.3, 3.1, 3.3
 * - Apply glassmorphism styles: backdrop-blur-md, bg-black/40, border-white/10
 * - Display tool label in node header
 * - Embed Slider component for value adjustment
 * - Add input Handle on left, output Handle on right
 * - Wire slider onChange to store.updateNodeValue
 */
function ToolNode({ id, data, selected }: ToolNodeProps) {
  const updateNodeValue = useAppStore((state) => state.updateNodeValue);

  const handleValueChange = (value: number) => {
    updateNodeValue(id, value);
  };

  return (
    <div
      className={`
        backdrop-blur-md bg-black/40 border rounded-xl
        min-w-[180px] p-3
        ${selected ? 'border-white/30 shadow-lg' : 'border-white/10'}
      `}
      data-testid={`tool-node-${id}`}
    >
      {/* Input Handle - left side */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-white/60 !border-white/30"
      />

      {/* Node Header */}
      <div className="text-sm font-medium text-zinc-200 mb-2">
        {data.label}
      </div>

      {/* Slider Control */}
      <Slider
        id={`node-slider-${id}`}
        label={data.label}
        value={data.value}
        min={data.min}
        max={data.max}
        onChange={handleValueChange}
      />

      {/* Output Handle - right side */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-white/60 !border-white/30"
      />
    </div>
  );
}

export default memo(ToolNode);
