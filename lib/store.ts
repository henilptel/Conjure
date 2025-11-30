/**
 * Zustand store for centralized state management
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5
 */
import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';
import { 
  ActiveTool, 
  ToolInput, 
  addToolsWithValues, 
  removeTool as removeToolFromArray, 
  updateToolValue as updateToolValueInArray 
} from './types';
import { getToolConfig } from './tools-registry';
import { 
  ToolNodeData, 
  SourceNodeData,
  OutputNodeData,
  GraphNodeData, 
  traverseGraph, 
  applyDagreLayout 
} from './graph-utils';

/**
 * Image state data shared between components
 */
export interface ImageStateData {
  hasImage: boolean;
  width: number | null;
  height: number | null;
}

/**
 * Processing status for image operations
 */
export type ProcessingStatus = 'idle' | 'initializing' | 'processing' | 'complete' | 'error';

/**
 * Application state interface
 * Requirements: 4.1 - Store contains nodes and edges arrays instead of activeTools
 */
export interface AppState {
  // Legacy State (kept for backwards compatibility)
  activeTools: ActiveTool[];
  
  // Graph State (Requirements: 4.1)
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  
  // Other State
  imageState: ImageStateData;
  processingStatus: ProcessingStatus;
  
  // Legacy Actions (kept for backwards compatibility)
  addTool: (toolInputs: ToolInput[]) => void;
  removeTool: (toolId: string) => void;
  updateToolValue: (toolId: string, value: number) => void;
  setImageState: (state: Partial<ImageStateData>) => void;
  setProcessingStatus: (status: ProcessingStatus) => void;
  resetTools: () => void;
  
  // Graph Actions (Requirements: 4.2, 4.3, 4.4, 4.5)
  addNode: (toolId: string, position?: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  updateNodeValue: (nodeId: string, value: number) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  connectNodes: (sourceId: string, targetId: string) => void;
  disconnectNodes: (edgeId: string) => void;
  setGraph: (nodes: Node<GraphNodeData>[], edges: Edge[]) => void;
  getOrderedTools: () => ActiveTool[];
  initializeGraph: () => void;
}

/**
 * Default image state
 */
const defaultImageState: ImageStateData = {
  hasImage: false,
  width: null,
  height: null,
};

/**
 * Generate a unique ID for nodes and edges
 */
let nodeIdCounter = 0;
let edgeIdCounter = 0;

function generateNodeId(): string {
  return `node-${++nodeIdCounter}`;
}

function generateEdgeId(): string {
  return `edge-${++edgeIdCounter}`;
}

/**
 * Zustand store for application state
 * Provides centralized state management for nodes, edges, imageState, and processingStatus
 * Requirements: 4.1
 */
export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  activeTools: [],
  nodes: [],
  edges: [],
  imageState: defaultImageState,
  processingStatus: 'idle',
  
  // Legacy Actions (kept for backwards compatibility)
  
  /**
   * Add tools to activeTools array
   * Uses existing addToolsWithValues logic for deduplication and validation
   * Requirements: 1.2
   */
  addTool: (toolInputs: ToolInput[]) => {
    set((state) => ({
      activeTools: addToolsWithValues(state.activeTools, toolInputs),
    }));
  },
  
  /**
   * Remove a tool from activeTools by id
   * Uses existing removeTool logic
   * Requirements: 1.3
   */
  removeTool: (toolId: string) => {
    set((state) => ({
      activeTools: removeToolFromArray(state.activeTools, toolId),
    }));
  },
  
  /**
   * Update a tool's value with clamping to min/max range
   * Uses existing updateToolValue logic
   * Requirements: 1.4
   */
  updateToolValue: (toolId: string, value: number) => {
    set((state) => ({
      activeTools: updateToolValueInArray(state.activeTools, toolId, value),
    }));
  },
  
  /**
   * Update image state with partial data
   * Merges provided values with existing state
   * Requirements: 1.5
   */
  setImageState: (newState: Partial<ImageStateData>) => {
    set((state) => ({
      imageState: { ...state.imageState, ...newState },
    }));
  },
  
  /**
   * Set processing status
   */
  setProcessingStatus: (status: ProcessingStatus) => {
    set({ processingStatus: status });
  },
  
  /**
   * Reset tools to empty array
   */
  resetTools: () => {
    set({ activeTools: [], nodes: [], edges: [] });
  },
  
  // Graph Actions (Requirements: 4.2, 4.3, 4.4, 4.5)
  
  /**
   * Add a new node to the graph
   * Creates node with unique ID, default position, and tool config from TOOL_REGISTRY
   * Automatically inserts the node into the pipeline (before the Output node)
   * Requirements: 4.2
   */
  addNode: (toolId: string, position?: { x: number; y: number }) => {
    const toolConfig = getToolConfig(toolId);
    if (!toolConfig) {
      // Invalid toolId - no-op
      console.warn(`addNode: Invalid toolId "${toolId}"`);
      return;
    }
    
    const nodeData: ToolNodeData = {
      toolId: toolConfig.id,
      label: toolConfig.label,
      value: toolConfig.defaultValue,
      min: toolConfig.min,
      max: toolConfig.max,
    };
    
    const newNodeId = generateNodeId();
    const newNode: Node<ToolNodeData> = {
      id: newNodeId,
      type: 'toolNode',
      position: position ?? { x: 200, y: 150 },
      data: nodeData,
    };
    
    set((state) => {
      // Find the edge that connects to the output node
      const outputEdge = state.edges.find((edge) => edge.target === 'output');
      
      if (outputEdge) {
        // Insert the new node between the source and output
        // Remove the old edge to output, add edge from source to new node, add edge from new node to output
        const newEdges = state.edges.filter((edge) => edge.id !== outputEdge.id);
        newEdges.push({
          id: generateEdgeId(),
          source: outputEdge.source,
          target: newNodeId,
        });
        newEdges.push({
          id: generateEdgeId(),
          source: newNodeId,
          target: 'output',
        });
        
        // Apply layout to position nodes nicely
        const newNodes = [...state.nodes, newNode];
        const layoutedNodes = applyDagreLayout(newNodes, newEdges);
        
        return {
          nodes: layoutedNodes,
          edges: newEdges,
        };
      }
      
      // No output edge found, just add the node without connecting
      return {
        nodes: [...state.nodes, newNode],
      };
    });
  },
  
  /**
   * Remove a node from the graph
   * Also removes all edges connected to the node
   * Requirements: 4.2
   */
  removeNode: (nodeId: string) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
    }));
  },
  
  /**
   * Update a node's value
   * Clamps value to min/max range
   * Requirements: 3.2, 4.3
   */
  updateNodeValue: (nodeId: string, value: number) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }
        
        const data = node.data as ToolNodeData;
        if (!data || typeof data.min !== 'number' || typeof data.max !== 'number') {
          return node;
        }
        
        // Reject NaN values
        if (isNaN(value)) {
          return node;
        }
        
        // Clamp value to min/max range
        const clampedValue = Math.max(data.min, Math.min(data.max, value));
        
        return {
          ...node,
          data: {
            ...data,
            value: clampedValue,
          },
        };
      }),
    }));
  },
  
  /**
   * Update a node's position
   * Requirements: 3.4
   */
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }
        return {
          ...node,
          position,
        };
      }),
    }));
  },
  
  /**
   * Connect two nodes with an edge
   * Creates edge with unique ID, source, and target
   * Requirements: 2.1, 2.2, 4.4
   */
  connectNodes: (sourceId: string, targetId: string) => {
    const state = get();
    
    // Verify both nodes exist
    const sourceExists = state.nodes.some((node) => node.id === sourceId);
    const targetExists = state.nodes.some((node) => node.id === targetId);
    
    if (!sourceExists || !targetExists) {
      console.warn(`connectNodes: Invalid node IDs - source: ${sourceId}, target: ${targetId}`);
      return;
    }
    
    const newEdge: Edge = {
      id: generateEdgeId(),
      source: sourceId,
      target: targetId,
    };
    
    set((state) => ({
      edges: [...state.edges, newEdge],
    }));
  },
  
  /**
   * Remove an edge from the graph
   * Requirements: 2.3
   */
  disconnectNodes: (edgeId: string) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId),
    }));
  },
  
  /**
   * Replace entire graph state
   * Applies Dagre auto-layout to position nodes
   * Requirements: 4.5, 6.1
   */
  setGraph: (nodes: Node<GraphNodeData>[], edges: Edge[]) => {
    // Apply Dagre auto-layout to position nodes
    const layoutedNodes = applyDagreLayout(nodes, edges);
    
    set({
      nodes: layoutedNodes,
      edges,
    });
  },
  
  /**
   * Get ordered tools from graph traversal
   * Uses traverseGraph utility to compute ordered ActiveTool[] from current graph
   * Returns empty array if no connected nodes
   * Requirements: 5.1, 5.2
   */
  getOrderedTools: (): ActiveTool[] => {
    const state = get();
    const result = traverseGraph(state.nodes, state.edges);
    return result.orderedTools;
  },
  
  /**
   * Initialize the graph with Source and Output nodes
   * Called when an image is loaded to set up the basic pipeline structure
   */
  initializeGraph: () => {
    const sourceNode: Node<SourceNodeData> = {
      id: 'source',
      type: 'sourceNode',
      position: { x: 50, y: 150 },
      data: { type: 'source' },
    };
    
    const outputNode: Node<OutputNodeData> = {
      id: 'output',
      type: 'outputNode',
      position: { x: 400, y: 150 },
      data: { type: 'output' },
    };
    
    const initialEdge: Edge = {
      id: 'edge-source-output',
      source: 'source',
      target: 'output',
    };
    
    set({
      nodes: [sourceNode, outputNode],
      edges: [initialEdge],
    });
  },
}));
