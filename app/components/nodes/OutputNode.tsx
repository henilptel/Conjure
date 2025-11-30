'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Monitor } from 'lucide-react';
import { OutputNodeData } from '@/lib/graph-utils';

/**
 * Props for OutputNode component
 */
interface OutputNodeProps {
  id: string;
  data: OutputNodeData;
  selected: boolean;
}

/**
 * Custom React Flow node component for the output node.
 * Represents the final processed image output in the pipeline.
 * 
 * Requirements: 5.1
 * - Minimal glass-styled node representing final output
 * - Input Handle only (left side)
 * - Display "Output" label
 */
function OutputNode({ id, selected }: OutputNodeProps) {
  return (
    <div
      className={`
        backdrop-blur-md bg-black/40 border rounded-xl
        min-w-[100px] p-3 flex flex-col items-center gap-2
        ${selected ? 'border-white/30 shadow-lg' : 'border-white/10'}
      `}
      data-testid={`output-node-${id}`}
    >
      {/* Input Handle - left side only */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-white/60 !border-white/30"
      />

      {/* Monitor icon */}
      <Monitor className="w-6 h-6 text-zinc-300" />

      {/* Label */}
      <div className="text-sm font-medium text-zinc-200">
        Output
      </div>
    </div>
  );
}

export default memo(OutputNode);
