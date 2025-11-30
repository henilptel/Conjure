/**
 * Property-based tests for Node Graph Store Actions
 * **Feature: node-graph-architecture**
 * 
 * Tests the graph-based store actions for the node-based architecture.
 */

import * as fc from 'fast-check';
import { useAppStore } from '@/lib/store';
import { getAllToolIds } from '@/lib/tools-registry';
import { ToolNodeData, isToolNodeData } from '@/lib/graph-utils';
import { Node, Edge } from '@xyflow/react';

// Get all valid tool IDs from the registry
const VALID_TOOL_IDS = getAllToolIds();

// Arbitrary for generating valid tool IDs
const validToolIdArb = fc.constantFrom(...VALID_TOOL_IDS);

// Arbitrary for generating positions
const positionArb = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -1000, max: 1000 }),
});

// Arbitrary for generating node values (wide range to test clamping)
const nodeValueArb = fc.integer({ min: -500, max: 500 });

// Helper to reset store before each test
const resetStore = () => {
  useAppStore.setState({
    activeTools: [],
    nodes: [],
    edges: [],
    imageState: { hasImage: false, width: null, height: null },
    processingStatus: 'idle',
  });
};

describe('Property 5: Adding a node increases node count', () => {
  /**
   * **Feature: node-graph-architecture, Property 5: Adding a node increases node count**
   * 
   * For any valid toolId from TOOL_REGISTRY, when addNode(toolId) is called,
   * the nodes array length SHALL increase by exactly one and the new node
   * SHALL have the correct tool configuration (id, label, min, max, defaultValue).
   * 
   * **Validates: Requirements 4.2**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should increase node count by one when adding a valid tool', () => {
    fc.assert(
      fc.property(validToolIdArb, (toolId) => {
        resetStore();
        
        const { addNode, nodes: initialNodes } = useAppStore.getState();
        const initialCount = initialNodes.length;
        
        addNode(toolId);
        
        const { nodes: afterNodes } = useAppStore.getState();
        
        // Node count should increase by exactly one
        expect(afterNodes.length).toBe(initialCount + 1);
      }),
      { numRuns: 100 }
    );
  });

  it('should create node with correct tool configuration', () => {
    fc.assert(
      fc.property(validToolIdArb, (toolId) => {
        resetStore();
        
        const { addNode } = useAppStore.getState();
        
        addNode(toolId);
        
        const { nodes } = useAppStore.getState();
        const addedNode = nodes[nodes.length - 1];
        
        expect(addedNode).toBeDefined();
        expect(isToolNodeData(addedNode.data)).toBe(true);
        
        const data = addedNode.data as ToolNodeData;
        expect(data.toolId).toBe(toolId);
        expect(typeof data.label).toBe('string');
        expect(typeof data.min).toBe('number');
        expect(typeof data.max).toBe('number');
        expect(typeof data.value).toBe('number');
        // Value should be within min/max range
        expect(data.value).toBeGreaterThanOrEqual(data.min);
        expect(data.value).toBeLessThanOrEqual(data.max);
      }),
      { numRuns: 100 }
    );
  });

  it('should create node with provided position', () => {
    fc.assert(
      fc.property(validToolIdArb, positionArb, (toolId, position) => {
        resetStore();
        
        const { addNode } = useAppStore.getState();
        
        addNode(toolId, position);
        
        const { nodes } = useAppStore.getState();
        const addedNode = nodes[nodes.length - 1];
        
        expect(addedNode.position.x).toBe(position.x);
        expect(addedNode.position.y).toBe(position.y);
      }),
      { numRuns: 100 }
    );
  });

  it('should not add node for invalid toolId', () => {
    resetStore();
    
    const { addNode, nodes: initialNodes } = useAppStore.getState();
    const initialCount = initialNodes.length;
    
    // Try to add with invalid tool ID
    addNode('invalid-tool-id');
    
    const { nodes: afterNodes } = useAppStore.getState();
    
    // Node count should remain unchanged
    expect(afterNodes.length).toBe(initialCount);
  });
});


describe('Property 3: Node value updates are persisted', () => {
  /**
   * **Feature: node-graph-architecture, Property 3: Node value updates are persisted**
   * 
   * For any node in the graph and any valid value within the tool's min/max range,
   * when updateNodeValue(nodeId, value) is called, the corresponding node's
   * data.value SHALL equal the provided value.
   * 
   * **Validates: Requirements 3.2, 4.3**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should persist value updates within valid range', () => {
    fc.assert(
      fc.property(validToolIdArb, nodeValueArb, (toolId, newValue) => {
        resetStore();
        
        const { addNode, updateNodeValue } = useAppStore.getState();
        
        // Add a node first
        addNode(toolId);
        const { nodes: afterAdd } = useAppStore.getState();
        const nodeId = afterAdd[0].id;
        const data = afterAdd[0].data as ToolNodeData;
        
        // Update the value
        updateNodeValue(nodeId, newValue);
        
        const { nodes: afterUpdate } = useAppStore.getState();
        const updatedNode = afterUpdate.find(n => n.id === nodeId);
        const updatedData = updatedNode?.data as ToolNodeData;
        
        // Value should be clamped to min/max range
        const expectedValue = Math.max(data.min, Math.min(data.max, newValue));
        expect(updatedData.value).toBe(expectedValue);
      }),
      { numRuns: 100 }
    );
  });

  it('should clamp values to min/max range', () => {
    fc.assert(
      fc.property(validToolIdArb, nodeValueArb, (toolId, newValue) => {
        resetStore();
        
        const { addNode, updateNodeValue } = useAppStore.getState();
        
        addNode(toolId);
        const { nodes: afterAdd } = useAppStore.getState();
        const nodeId = afterAdd[0].id;
        const data = afterAdd[0].data as ToolNodeData;
        
        updateNodeValue(nodeId, newValue);
        
        const { nodes: afterUpdate } = useAppStore.getState();
        const updatedNode = afterUpdate.find(n => n.id === nodeId);
        const updatedData = updatedNode?.data as ToolNodeData;
        
        // Value should always be within min/max range
        expect(updatedData.value).toBeGreaterThanOrEqual(data.min);
        expect(updatedData.value).toBeLessThanOrEqual(data.max);
      }),
      { numRuns: 100 }
    );
  });

  it('should not affect other nodes when updating one', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolIdArb, validToolIdArb),
        nodeValueArb,
        ([toolId1, toolId2], newValue) => {
          resetStore();
          
          const { addNode, updateNodeValue } = useAppStore.getState();
          
          // Add two nodes
          addNode(toolId1);
          addNode(toolId2);
          
          const { nodes: afterAdd } = useAppStore.getState();
          const node1Id = afterAdd[0].id;
          const node2Id = afterAdd[1].id;
          const node2ValueBefore = (afterAdd[1].data as ToolNodeData).value;
          
          // Update only the first node
          updateNodeValue(node1Id, newValue);
          
          const { nodes: afterUpdate } = useAppStore.getState();
          const node2After = afterUpdate.find(n => n.id === node2Id);
          const node2ValueAfter = (node2After?.data as ToolNodeData).value;
          
          // Second node should be unchanged
          expect(node2ValueAfter).toBe(node2ValueBefore);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be a no-op for non-existent nodeId', () => {
    resetStore();
    
    const { addNode, updateNodeValue } = useAppStore.getState();
    
    addNode('blur');
    const { nodes: before } = useAppStore.getState();
    
    // Try to update a non-existent node
    updateNodeValue('non-existent-id', 50);
    
    const { nodes: after } = useAppStore.getState();
    
    // Nodes should be unchanged
    expect(after).toEqual(before);
  });
});


describe('Property 4: Node position updates are persisted', () => {
  /**
   * **Feature: node-graph-architecture, Property 4: Node position updates are persisted**
   * 
   * For any node in the graph and any position coordinates, when
   * updateNodePosition(nodeId, position) is called, the corresponding
   * node's position SHALL equal the provided coordinates.
   * 
   * **Validates: Requirements 3.4**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should persist position updates', () => {
    fc.assert(
      fc.property(validToolIdArb, positionArb, (toolId, newPosition) => {
        resetStore();
        
        const { addNode, updateNodePosition } = useAppStore.getState();
        
        // Add a node first
        addNode(toolId);
        const { nodes: afterAdd } = useAppStore.getState();
        const nodeId = afterAdd[0].id;
        
        // Update the position
        updateNodePosition(nodeId, newPosition);
        
        const { nodes: afterUpdate } = useAppStore.getState();
        const updatedNode = afterUpdate.find(n => n.id === nodeId);
        
        // Position should match the provided coordinates
        expect(updatedNode?.position.x).toBe(newPosition.x);
        expect(updatedNode?.position.y).toBe(newPosition.y);
      }),
      { numRuns: 100 }
    );
  });

  it('should not affect other nodes when updating position', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolIdArb, validToolIdArb),
        positionArb,
        ([toolId1, toolId2], newPosition) => {
          resetStore();
          
          const { addNode, updateNodePosition } = useAppStore.getState();
          
          // Add two nodes
          addNode(toolId1);
          addNode(toolId2);
          
          const { nodes: afterAdd } = useAppStore.getState();
          const node1Id = afterAdd[0].id;
          const node2Id = afterAdd[1].id;
          const node2PositionBefore = { ...afterAdd[1].position };
          
          // Update only the first node's position
          updateNodePosition(node1Id, newPosition);
          
          const { nodes: afterUpdate } = useAppStore.getState();
          const node2After = afterUpdate.find(n => n.id === node2Id);
          
          // Second node's position should be unchanged
          expect(node2After?.position.x).toBe(node2PositionBefore.x);
          expect(node2After?.position.y).toBe(node2PositionBefore.y);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be a no-op for non-existent nodeId', () => {
    resetStore();
    
    const { addNode, updateNodePosition } = useAppStore.getState();
    
    addNode('blur');
    const { nodes: before } = useAppStore.getState();
    
    // Try to update a non-existent node
    updateNodePosition('non-existent-id', { x: 100, y: 200 });
    
    const { nodes: after } = useAppStore.getState();
    
    // Nodes should be unchanged
    expect(after).toEqual(before);
  });
});


describe('Property 1: Edge creation stores source and target correctly', () => {
  /**
   * **Feature: node-graph-architecture, Property 1: Edge creation stores source and target correctly**
   * 
   * For any two valid node IDs in the graph, when connectNodes(sourceId, targetId)
   * is called, the edges array SHALL contain a new edge with the exact source
   * and target identifiers provided.
   * 
   * **Validates: Requirements 2.1, 2.2, 4.4**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should create edge with correct source and target', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolIdArb, validToolIdArb),
        ([toolId1, toolId2]) => {
          resetStore();
          
          const { addNode, connectNodes } = useAppStore.getState();
          
          // Add two nodes
          addNode(toolId1);
          addNode(toolId2);
          
          const { nodes: afterAdd, edges: edgesBefore } = useAppStore.getState();
          const sourceId = afterAdd[0].id;
          const targetId = afterAdd[1].id;
          const edgeCountBefore = edgesBefore.length;
          
          // Connect the nodes
          connectNodes(sourceId, targetId);
          
          const { edges: edgesAfter } = useAppStore.getState();
          
          // Edge count should increase by one
          expect(edgesAfter.length).toBe(edgeCountBefore + 1);
          
          // Find the new edge
          const newEdge = edgesAfter.find(
            e => e.source === sourceId && e.target === targetId
          );
          
          expect(newEdge).toBeDefined();
          expect(newEdge?.source).toBe(sourceId);
          expect(newEdge?.target).toBe(targetId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not create edge for non-existent source node', () => {
    resetStore();
    
    const { addNode, connectNodes } = useAppStore.getState();
    
    addNode('blur');
    const { nodes, edges: edgesBefore } = useAppStore.getState();
    const targetId = nodes[0].id;
    
    // Try to connect with non-existent source
    connectNodes('non-existent-source', targetId);
    
    const { edges: edgesAfter } = useAppStore.getState();
    
    // No edge should be created
    expect(edgesAfter.length).toBe(edgesBefore.length);
  });

  it('should not create edge for non-existent target node', () => {
    resetStore();
    
    const { addNode, connectNodes } = useAppStore.getState();
    
    addNode('blur');
    const { nodes, edges: edgesBefore } = useAppStore.getState();
    const sourceId = nodes[0].id;
    
    // Try to connect with non-existent target
    connectNodes(sourceId, 'non-existent-target');
    
    const { edges: edgesAfter } = useAppStore.getState();
    
    // No edge should be created
    expect(edgesAfter.length).toBe(edgesBefore.length);
  });
});


describe('Property 2: Edge removal decreases edge count', () => {
  /**
   * **Feature: node-graph-architecture, Property 2: Edge removal decreases edge count**
   * 
   * For any graph with at least one edge, when disconnectNodes(edgeId) is called
   * with a valid edge ID, the edges array length SHALL decrease by exactly one
   * and the specified edge SHALL no longer exist in the array.
   * 
   * **Validates: Requirements 2.3**
   */

  beforeEach(() => {
    resetStore();
  });

  it('should decrease edge count by one when removing valid edge', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolIdArb, validToolIdArb),
        ([toolId1, toolId2]) => {
          resetStore();
          
          const { addNode, connectNodes, disconnectNodes } = useAppStore.getState();
          
          // Add two nodes and connect them
          addNode(toolId1);
          addNode(toolId2);
          
          const { nodes: afterAdd } = useAppStore.getState();
          const sourceId = afterAdd[0].id;
          const targetId = afterAdd[1].id;
          
          connectNodes(sourceId, targetId);
          
          const { edges: edgesBefore } = useAppStore.getState();
          const edgeToRemove = edgesBefore[0];
          const edgeCountBefore = edgesBefore.length;
          
          // Remove the edge
          disconnectNodes(edgeToRemove.id);
          
          const { edges: edgesAfter } = useAppStore.getState();
          
          // Edge count should decrease by one
          expect(edgesAfter.length).toBe(edgeCountBefore - 1);
          
          // The removed edge should no longer exist
          const removedEdge = edgesAfter.find(e => e.id === edgeToRemove.id);
          expect(removedEdge).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve other edges when removing one', () => {
    fc.assert(
      fc.property(
        fc.tuple(validToolIdArb, validToolIdArb, validToolIdArb),
        ([toolId1, toolId2, toolId3]) => {
          resetStore();
          
          const { addNode, connectNodes, disconnectNodes } = useAppStore.getState();
          
          // Add three nodes
          addNode(toolId1);
          addNode(toolId2);
          addNode(toolId3);
          
          const { nodes: afterAdd } = useAppStore.getState();
          const node1Id = afterAdd[0].id;
          const node2Id = afterAdd[1].id;
          const node3Id = afterAdd[2].id;
          
          // Create two edges
          connectNodes(node1Id, node2Id);
          connectNodes(node2Id, node3Id);
          
          const { edges: edgesBefore } = useAppStore.getState();
          const edgeToRemove = edgesBefore[0];
          const edgeToKeep = edgesBefore[1];
          
          // Remove one edge
          disconnectNodes(edgeToRemove.id);
          
          const { edges: edgesAfter } = useAppStore.getState();
          
          // The kept edge should still exist
          const keptEdge = edgesAfter.find(e => e.id === edgeToKeep.id);
          expect(keptEdge).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be a no-op for non-existent edgeId', () => {
    resetStore();
    
    const { addNode, connectNodes, disconnectNodes } = useAppStore.getState();
    
    addNode('blur');
    addNode('grayscale');
    
    const { nodes } = useAppStore.getState();
    connectNodes(nodes[0].id, nodes[1].id);
    
    const { edges: edgesBefore } = useAppStore.getState();
    
    // Try to remove a non-existent edge
    disconnectNodes('non-existent-edge');
    
    const { edges: edgesAfter } = useAppStore.getState();
    
    // Edges should be unchanged
    expect(edgesAfter.length).toBe(edgesBefore.length);
  });
});


describe('Property 6: setGraph replaces entire graph state', () => {
  /**
   * **Feature: node-graph-architecture, Property 6: setGraph replaces entire graph state**
   * 
   * For any arrays of nodes and edges, when setGraph(nodes, edges) is called,
   * the store's nodes SHALL equal the provided nodes array (with layout applied)
   * and the store's edges SHALL equal the provided edges array.
   * 
   * **Validates: Requirements 4.5**
   */

  beforeEach(() => {
    resetStore();
  });

  // Helper to create a valid node for testing
  const createTestNode = (id: string, toolId: string, position: { x: number; y: number }): Node<ToolNodeData> => ({
    id,
    type: 'toolNode',
    position,
    data: {
      toolId,
      label: toolId.charAt(0).toUpperCase() + toolId.slice(1),
      value: 0,
      min: 0,
      max: 100,
    },
  });

  // Helper to create a valid edge for testing
  const createTestEdge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
  });

  it('should replace edges with provided edges', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(validToolIdArb, fc.uuid()), { minLength: 2, maxLength: 5 }),
        (nodeSpecs) => {
          resetStore();
          
          const { setGraph } = useAppStore.getState();
          
          // Create test nodes
          const testNodes = nodeSpecs.map(([toolId, uuid], index) => 
            createTestNode(`node-${uuid}`, toolId, { x: index * 100, y: 0 })
          );
          
          // Create test edges (connect consecutive nodes)
          const testEdges: Edge[] = [];
          for (let i = 0; i < testNodes.length - 1; i++) {
            testEdges.push(createTestEdge(`edge-${i}`, testNodes[i].id, testNodes[i + 1].id));
          }
          
          // Set the graph
          setGraph(testNodes, testEdges);
          
          const { edges: storeEdges } = useAppStore.getState();
          
          // Edges should match exactly
          expect(storeEdges.length).toBe(testEdges.length);
          for (const testEdge of testEdges) {
            const foundEdge = storeEdges.find(e => e.id === testEdge.id);
            expect(foundEdge).toBeDefined();
            expect(foundEdge?.source).toBe(testEdge.source);
            expect(foundEdge?.target).toBe(testEdge.target);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should replace nodes with provided nodes (with layout applied)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(validToolIdArb, fc.uuid()), { minLength: 1, maxLength: 5 }),
        (nodeSpecs) => {
          resetStore();
          
          const { setGraph } = useAppStore.getState();
          
          // Create test nodes
          const testNodes = nodeSpecs.map(([toolId, uuid], index) => 
            createTestNode(`node-${uuid}`, toolId, { x: index * 100, y: 0 })
          );
          
          // Set the graph with empty edges
          setGraph(testNodes, []);
          
          const { nodes: storeNodes } = useAppStore.getState();
          
          // Node count should match
          expect(storeNodes.length).toBe(testNodes.length);
          
          // Each node should exist with correct data (positions may differ due to layout)
          for (const testNode of testNodes) {
            const foundNode = storeNodes.find(n => n.id === testNode.id);
            expect(foundNode).toBeDefined();
            expect((foundNode?.data as ToolNodeData).toolId).toBe((testNode.data as ToolNodeData).toolId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clear existing graph when setting new one', () => {
    resetStore();
    
    const { addNode, connectNodes, setGraph } = useAppStore.getState();
    
    // Add some initial nodes and edges
    addNode('blur');
    addNode('grayscale');
    const { nodes: initialNodes } = useAppStore.getState();
    connectNodes(initialNodes[0].id, initialNodes[1].id);
    
    // Create new test nodes
    const newNodes = [
      createTestNode('new-node-1', 'sepia', { x: 0, y: 0 }),
      createTestNode('new-node-2', 'contrast', { x: 100, y: 0 }),
    ];
    const newEdges = [createTestEdge('new-edge-1', 'new-node-1', 'new-node-2')];
    
    // Set new graph
    setGraph(newNodes, newEdges);
    
    const { nodes: storeNodes, edges: storeEdges } = useAppStore.getState();
    
    // Old nodes should be gone
    expect(storeNodes.find(n => n.id === initialNodes[0].id)).toBeUndefined();
    expect(storeNodes.find(n => n.id === initialNodes[1].id)).toBeUndefined();
    
    // New nodes should exist
    expect(storeNodes.find(n => n.id === 'new-node-1')).toBeDefined();
    expect(storeNodes.find(n => n.id === 'new-node-2')).toBeDefined();
    
    // New edges should exist
    expect(storeEdges.length).toBe(1);
    expect(storeEdges[0].id).toBe('new-edge-1');
  });
});
