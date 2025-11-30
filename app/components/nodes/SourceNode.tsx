'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image } from 'lucide-react';
import { SourceNodeData } from '@/lib/graph-utils';

/**
 * Props for SourceNode component
 */
interface SourceNodeProps {
  id: string;
  data: SourceNodeData;
  selected: boolean;
}

/**
 * Custom React Flow node component for the source/input node.
 * Represents the original image input in the processing pipeline.
 * 
 * Requirements: 5.1
 * - Minimal glass-styled node representing image input
 * - Output Handle only (right side)
 * - Display "Source" or image thumbnail
 */
function SourceNode({ id, selected }: SourceNodeProps) {
  return (
    <div
      className={`
        backdrop-blur-md bg-black/40 border rounded-xl
        min-w-[100px] p-3 flex flex-col items-center gap-2
        ${selected ? 'border-white/30 shadow-lg' : 'border-white/10'}
      `}
      data-testid={`source-node-${id}`}
    >
      {/* Image icon */}
      <Image className="w-6 h-6 text-zinc-300" />

      {/* Label */}
      <div className="text-sm font-medium text-zinc-200">
        Source
      </div>

      {/* Output Handle - right side only */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-white/60 !border-white/30"
      />
    </div>
  );
}

export default memo(SourceNode);
