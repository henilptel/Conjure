'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  NodeChange,
  EdgeChange,
  DefaultEdgeOptions,
  ConnectionLineType,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useAppStore } from '@/lib/store';
import { nodeTypes } from './nodes';

/**
 * Props for the NodeGraph component
 */
interface NodeGraphProps {
  /** When true, disables all interactions (during processing) */
  disabled?: boolean;
}

/**
 * Default edge options for glass aesthetic styling
 * Custom edge styles with white/30 color and animation
 * Requirements: 1.3, 2.4
 */
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  style: {
    stroke: 'rgba(255, 255, 255, 0.3)',
    strokeWidth: 2,
  },
  animated: true,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: 'rgba(255, 255, 255, 0.3)',
    width: 15,
    height: 15,
  },
};

/**
 * NodeGraph Component
 * 
 * Renders a React Flow graph with custom glassmorphism-styled nodes.
 * Subscribes to store nodes and edges, handles position updates,
 * edge modifications, and new edge creation.
 * 
 * Requirements: 1.1, 1.2, 2.1, 2.4
 */
export default function NodeGraph({ disabled = false }: NodeGraphProps) {
  // Subscribe to store state
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const updateNodePosition = useAppStore((state) => state.updateNodePosition);
  const connectNodes = useAppStore((state) => state.connectNodes);
  const disconnectNodes = useAppStore((state) => state.disconnectNodes);

  /**
   * Handle node changes (position updates, selection, etc.)
   * Requirements: 3.4
   */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (disabled) return;

      // Process position changes and update store
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id) {
          updateNodePosition(change.id, change.position);
        }
      }
    },
    [disabled, updateNodePosition]
  );

  /**
   * Handle edge changes (removal, selection, etc.)
   * Requirements: 2.3
   */
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (disabled) return;

      // Process edge removals
      for (const change of changes) {
        if (change.type === 'remove' && change.id) {
          disconnectNodes(change.id);
        }
      }
    },
    [disabled, disconnectNodes]
  );

  /**
   * Handle new edge connections
   * Requirements: 2.1, 2.2
   */
  const onConnect = useCallback(
    (connection: Connection) => {
      if (disabled) return;
      if (connection.source && connection.target) {
        connectNodes(connection.source, connection.target);
      }
    },
    [disabled, connectNodes]
  );

  /**
   * Custom styles for the connection line during drag
   * Requirements: 1.3, 2.4
   */
  const connectionLineStyle = useMemo(
    () => ({
      stroke: 'rgba(255, 255, 255, 0.5)',
      strokeWidth: 2,
    }),
    []
  );

  return (
    <div className="w-full h-full bg-transparent" data-testid="node-graph">
      <ReactFlow
        nodes={nodes as any}
        edges={edges}
        nodeTypes={nodeTypes as any}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineStyle={connectionLineStyle}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
        panOnDrag={!disabled}
        zoomOnScroll={!disabled}
        zoomOnPinch={!disabled}
        zoomOnDoubleClick={!disabled}
        proOptions={{ hideAttribution: true }}
      >
        {/* Transparent background - no grid pattern */}
        <Background
          gap={0}
          color="transparent"
          className="!bg-transparent"
        />
        
        {/* Styled controls to match glass aesthetic */}
        <Controls
          className="!bg-black/40 !backdrop-blur-md !border !border-white/10 !rounded-lg [&>button]:!bg-transparent [&>button]:!border-white/10 [&>button:hover]:!bg-white/10 [&_svg]:!fill-white/70"
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="top-left"
        />
        
        {/* Mini map with glass styling */}
        <MiniMap
          className="!bg-black/40 !backdrop-blur-md !border-white/10 !rounded-lg"
          nodeColor="rgba(255, 255, 255, 0.3)"
          maskColor="rgba(0, 0, 0, 0.5)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
