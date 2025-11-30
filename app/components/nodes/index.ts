/**
 * Custom React Flow node components for the node graph architecture.
 * 
 * Exports:
 * - ToolNode: Glassmorphism-styled node with slider control for tool parameters
 * - SourceNode: Input node representing the original image
 * - OutputNode: Output node representing the final processed image
 */

export { default as ToolNode } from './ToolNode';
export { default as SourceNode } from './SourceNode';
export { default as OutputNode } from './OutputNode';

/**
 * Node types configuration for React Flow.
 * Use this object when configuring the ReactFlow component.
 */
import ToolNode from './ToolNode';
import SourceNode from './SourceNode';
import OutputNode from './OutputNode';

export const nodeTypes = {
  toolNode: ToolNode,
  sourceNode: SourceNode,
  outputNode: OutputNode,
} as const;
