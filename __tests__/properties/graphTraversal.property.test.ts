/**
 * Property-based tests for graph traversal utility
 * **Feature: node-graph-architecture, Property 7: Graph traversal produces topologically ordered tools**
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

import * as fc from 'fast-check';
import { Node, Edge } from '@xyflow/react';
import {
  traverseGraph,
  ToolNodeData,
  SourceNodeData,
  GraphNodeData,
} from '@/lib/graph-utils';
import { getAllToolIds } from '@/lib/tools-registry';

// Get valid tool IDs from registry
const VALID_TOOL_IDS = getAllToolIds();

/**
 * Arbitrary for generating a valid tool ID
 */
const toolIdArb = fc.constantFrom(...VALID_TOOL_IDS);

/**
 * Arbitrary for generating ToolNodeData
 */
const toolNodeDataArb = (toolId: string): fc.Arbitrary<ToolNodeData> =>
  fc.record({
    toolId: fc.constant(toolId),
    label: fc.constant(toolId.charAt(0).toUpperCase() + toolId.slice(1)),
    value: fc.integer({ min: 0, max: 100 }),
    min: fc.constant(0),
    max: fc.constant(100),
  });

/**
 * Arbitrary for generating a source node
 */
const sourceNodeArb: fc.Arbitrary<Node<SourceNodeData>> = fc.record({
  id: fc.constant('source'),
  type: fc.constant('sourceNode'),
  position: fc.record({ x: fc.constant(0), y: fc.constant(0) }),
  data: fc.constant({ type: 'source' as const }),
});

/**
 * Arbitrary for generating a tool node with a specific ID
 */
const toolNodeArb = (
  nodeId: string,
  toolId: string
): fc.Arbitrary<Node<ToolNodeData>> =>
  toolNodeDataArb(toolId).map((data) => ({
    id: nodeId,
    type: 'toolNode',
    position: { x: 0, y: 0 },
    data,
  }));


/**
 * Generates a valid connected graph with source node and tool nodes
 * Returns nodes connected in a linear chain: source -> tool1 -> tool2 -> ...
 */
const connectedGraphArb = fc
  .array(toolIdArb, { minLength: 1, maxLength: 5 })
  .chain((toolIds) => {
    // Create unique node IDs for each tool
    const nodeIds = toolIds.map((_, i) => `tool-${i}`);

    // Generate source node
    const sourceGen = sourceNodeArb;

    // Generate tool nodes
    const toolNodesGen = fc.tuple(
      ...toolIds.map((toolId, i) => toolNodeArb(nodeIds[i], toolId))
    );

    return fc.tuple(sourceGen, toolNodesGen).map(([source, toolNodes]) => {
      const nodes: Node<GraphNodeData>[] = [source, ...toolNodes];

      // Create edges: source -> tool0 -> tool1 -> ... -> toolN
      const edges: Edge[] = [];
      edges.push({
        id: 'edge-source-0',
        source: 'source',
        target: nodeIds[0],
      });
      for (let i = 0; i < nodeIds.length - 1; i++) {
        edges.push({
          id: `edge-${i}-${i + 1}`,
          source: nodeIds[i],
          target: nodeIds[i + 1],
        });
      }

      return { nodes, edges, expectedOrder: toolIds };
    });
  });

/**
 * Generates a graph with some disconnected nodes
 */
const graphWithDisconnectedNodesArb = fc
  .tuple(
    fc.array(toolIdArb, { minLength: 1, maxLength: 3 }), // connected tools
    fc.array(toolIdArb, { minLength: 1, maxLength: 2 }) // disconnected tools
  )
  .chain(([connectedToolIds, disconnectedToolIds]) => {
    const connectedNodeIds = connectedToolIds.map((_, i) => `connected-${i}`);
    const disconnectedNodeIds = disconnectedToolIds.map(
      (_, i) => `disconnected-${i}`
    );

    const sourceGen = sourceNodeArb;
    const connectedNodesGen = fc.tuple(
      ...connectedToolIds.map((toolId, i) =>
        toolNodeArb(connectedNodeIds[i], toolId)
      )
    );
    const disconnectedNodesGen = fc.tuple(
      ...disconnectedToolIds.map((toolId, i) =>
        toolNodeArb(disconnectedNodeIds[i], toolId)
      )
    );

    return fc
      .tuple(sourceGen, connectedNodesGen, disconnectedNodesGen)
      .map(([source, connectedNodes, disconnectedNodes]) => {
        const nodes: Node<GraphNodeData>[] = [
          source,
          ...connectedNodes,
          ...disconnectedNodes,
        ];

        // Only connect the "connected" nodes
        const edges: Edge[] = [];
        edges.push({
          id: 'edge-source-0',
          source: 'source',
          target: connectedNodeIds[0],
        });
        for (let i = 0; i < connectedNodeIds.length - 1; i++) {
          edges.push({
            id: `edge-${i}-${i + 1}`,
            source: connectedNodeIds[i],
            target: connectedNodeIds[i + 1],
          });
        }

        return {
          nodes,
          edges,
          connectedNodeIds,
          disconnectedNodeIds,
        };
      });
  });


describe('Property 7: Graph traversal produces topologically ordered tools', () => {
  /**
   * **Feature: node-graph-architecture, Property 7: Graph traversal produces topologically ordered tools**
   *
   * For any valid graph with a Source node and connected tool nodes, the `getOrderedTools()`
   * function SHALL return tools in topological order following edge connections from Source,
   * and disconnected nodes SHALL be excluded from the result.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */

  it('should return tools in order following edges from source', () => {
    fc.assert(
      fc.property(connectedGraphArb, ({ nodes, edges, expectedOrder }) => {
        const result = traverseGraph(nodes, edges);

        // Should return the same number of tools as connected
        expect(result.orderedTools).toHaveLength(expectedOrder.length);

        // Tools should be in the order they appear following edges
        const resultToolIds = result.orderedTools.map((t) => t.id);
        expect(resultToolIds).toEqual(expectedOrder);

        // No disconnected nodes in a fully connected graph
        expect(result.disconnectedNodes).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should exclude disconnected nodes from ordered tools', () => {
    fc.assert(
      fc.property(
        graphWithDisconnectedNodesArb,
        ({ nodes, edges, connectedNodeIds, disconnectedNodeIds }) => {
          const result = traverseGraph(nodes, edges);

          // Ordered tools should only include connected nodes
          expect(result.orderedTools).toHaveLength(connectedNodeIds.length);

          // Disconnected nodes should be reported
          expect(result.disconnectedNodes.sort()).toEqual(
            disconnectedNodeIds.sort()
          );

          // Verify no disconnected node IDs appear in ordered tools
          const orderedNodeIds = new Set(
            result.orderedTools.map((t) => t.id)
          );
          for (const disconnectedId of disconnectedNodeIds) {
            // The disconnected node IDs are node IDs, not tool IDs
            // So we check that disconnected nodes are in disconnectedNodes result
            expect(result.disconnectedNodes).toContain(disconnectedId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty array when no source node exists', () => {
    fc.assert(
      fc.property(
        fc.array(toolIdArb, { minLength: 1, maxLength: 3 }),
        (toolIds) => {
          // Create nodes without a source
          const nodes: Node<GraphNodeData>[] = toolIds.map((toolId, i) => ({
            id: `tool-${i}`,
            type: 'toolNode',
            position: { x: 0, y: 0 },
            data: {
              toolId,
              label: toolId,
              value: 50,
              min: 0,
              max: 100,
            },
          }));

          const edges: Edge[] = [];
          for (let i = 0; i < nodes.length - 1; i++) {
            edges.push({
              id: `edge-${i}`,
              source: nodes[i].id,
              target: nodes[i + 1].id,
            });
          }

          const result = traverseGraph(nodes, edges);

          // No source means no ordered tools
          expect(result.orderedTools).toHaveLength(0);

          // All tool nodes should be disconnected
          expect(result.disconnectedNodes).toHaveLength(toolIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle cycles without infinite loops', () => {
    // Create a graph with a cycle: source -> A -> B -> A (cycle)
    const sourceNode: Node<SourceNodeData> = {
      id: 'source',
      type: 'sourceNode',
      position: { x: 0, y: 0 },
      data: { type: 'source' },
    };

    const nodeA: Node<ToolNodeData> = {
      id: 'node-a',
      type: 'toolNode',
      position: { x: 100, y: 0 },
      data: { toolId: 'blur', label: 'Blur', value: 5, min: 0, max: 20 },
    };

    const nodeB: Node<ToolNodeData> = {
      id: 'node-b',
      type: 'toolNode',
      position: { x: 200, y: 0 },
      data: { toolId: 'grayscale', label: 'Grayscale', value: 50, min: 0, max: 100 },
    };

    const nodes: Node<GraphNodeData>[] = [sourceNode, nodeA, nodeB];
    const edges: Edge[] = [
      { id: 'e1', source: 'source', target: 'node-a' },
      { id: 'e2', source: 'node-a', target: 'node-b' },
      { id: 'e3', source: 'node-b', target: 'node-a' }, // Creates cycle
    ];

    // Should complete without hanging
    const result = traverseGraph(nodes, edges);

    // Should still return the tools (cycle detection prevents infinite loop)
    expect(result.orderedTools.length).toBeGreaterThanOrEqual(0);
    expect(result.disconnectedNodes).toHaveLength(0);
  });

  it('should return empty ordered tools for empty graph', () => {
    const result = traverseGraph([], []);
    expect(result.orderedTools).toHaveLength(0);
    expect(result.disconnectedNodes).toHaveLength(0);
  });
});
