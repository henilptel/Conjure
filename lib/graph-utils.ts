/**
 * Graph Utilities for Node-Based Architecture
 * 
 * Provides graph traversal and auto-layout functionality for the node graph.
 * 
 * Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3
 */

import { Node, Edge } from '@xyflow/react';
import dagre from 'dagre';
import { ActiveTool } from './types';
import { getToolConfig } from './tools-registry';

/**
 * Data structure for tool nodes in the graph
 * Index signature added for React Flow compatibility
 */
export interface ToolNodeData {
  toolId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  [key: string]: unknown;
}

/**
 * Data structure for source nodes
 * Index signature added for React Flow compatibility
 */
export interface SourceNodeData {
  type: 'source';
  [key: string]: unknown;
}

/**
 * Data structure for output nodes
 * Index signature added for React Flow compatibility
 */
export interface OutputNodeData {
  type: 'output';
  [key: string]: unknown;
}

/**
 * Union type for all node data types
 */
export type GraphNodeData = ToolNodeData | SourceNodeData | OutputNodeData;

/**
 * Result of graph traversal
 */
export interface TraversalResult {
  /** Tools in topological order from Source node */
  orderedTools: ActiveTool[];
  /** Node IDs that are not connected to the Source node */
  disconnectedNodes: string[];
}

/**
 * Type guard to check if node data is ToolNodeData
 */
export function isToolNodeData(data: unknown): data is ToolNodeData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'toolId' in data &&
    typeof (data as ToolNodeData).toolId === 'string'
  );
}

/**
 * Type guard to check if node data is SourceNodeData
 */
export function isSourceNodeData(data: unknown): data is SourceNodeData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as SourceNodeData).type === 'source'
  );
}


/**
 * Traverses the graph starting from the Source node and returns tools in topological order.
 * Implements cycle detection to prevent infinite loops.
 * 
 * @param nodes - Array of nodes in the graph
 * @param edges - Array of edges connecting nodes
 * @returns TraversalResult with ordered tools and disconnected node IDs
 * 
 * Requirements: 5.1, 5.2, 5.3
 */
export function traverseGraph(
  nodes: Node<GraphNodeData>[],
  edges: Edge[]
): TraversalResult {
  // Find the source node
  const sourceNode = nodes.find(
    (node) => isSourceNodeData(node.data)
  );

  // If no source node, all tool nodes are disconnected
  if (!sourceNode) {
    const disconnectedNodes = nodes
      .filter((node) => isToolNodeData(node.data))
      .map((node) => node.id);
    return { orderedTools: [], disconnectedNodes };
  }

  // Build adjacency list for efficient traversal
  const adjacencyList = new Map<string, string[]>();
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
  }
  for (const edge of edges) {
    const neighbors = adjacencyList.get(edge.source);
    if (neighbors) {
      neighbors.push(edge.target);
    }
  }

  // Track visited nodes and nodes in current path (for cycle detection)
  const visited = new Set<string>();
  const inPath = new Set<string>();
  const orderedTools: ActiveTool[] = [];
  const reachableNodes = new Set<string>();

  /**
   * DFS traversal with cycle detection
   * Returns false if a cycle is detected
   */
  function dfs(nodeId: string): boolean {
    if (inPath.has(nodeId)) {
      // Cycle detected - skip this path
      return false;
    }
    if (visited.has(nodeId)) {
      // Already processed this node
      return true;
    }

    visited.add(nodeId);
    inPath.add(nodeId);
    reachableNodes.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighborId of neighbors) {
      dfs(neighborId);
    }

    inPath.delete(nodeId);

    // Add tool to ordered list (post-order for topological sort)
    const node = nodes.find((n) => n.id === nodeId);
    if (node && isToolNodeData(node.data)) {
      const toolConfig = getToolConfig(node.data.toolId);
      if (toolConfig) {
        orderedTools.unshift({
          id: node.data.toolId,
          label: node.data.label,
          value: node.data.value,
          min: node.data.min,
          max: node.data.max,
        });
      }
    }

    return true;
  }

  // Start traversal from source node
  dfs(sourceNode.id);

  // Find disconnected tool nodes
  const disconnectedNodes = nodes
    .filter(
      (node) =>
        isToolNodeData(node.data) && !reachableNodes.has(node.id)
    )
    .map((node) => node.id);

  return { orderedTools, disconnectedNodes };
}


/**
 * Default node dimensions for layout calculation
 */
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

/**
 * Applies Dagre auto-layout to position nodes in a left-to-right flow.
 * 
 * @param nodes - Array of nodes to layout
 * @param edges - Array of edges defining connections
 * @returns New array of nodes with updated positions
 * 
 * Requirements: 6.1, 6.2, 6.3
 */
export function applyDagreLayout(
  nodes: Node<GraphNodeData>[],
  edges: Edge[]
): Node<GraphNodeData>[] {
  if (nodes.length === 0) {
    return [];
  }

  // Create a new dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure for left-to-right layout
  dagreGraph.setGraph({
    rankdir: 'LR', // Left to Right
    nodesep: 50,   // Horizontal separation between nodes
    ranksep: 100,  // Vertical separation between ranks
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to dagre graph
  for (const node of nodes) {
    const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
    dagreGraph.setNode(node.id, { width, height });
  }

  // Add edges to dagre graph
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  // Run the layout algorithm
  dagre.layout(dagreGraph);

  // Update node positions from dagre results
  return nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    if (!dagreNode) {
      return node;
    }

    // Dagre returns center positions, convert to top-left for React Flow
    const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;

    return {
      ...node,
      position: {
        x: dagreNode.x - width / 2,
        y: dagreNode.y - height / 2,
      },
    };
  });
}
