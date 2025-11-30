/**
 * Property-based tests for Dagre auto-layout utility
 * **Feature: node-graph-architecture, Property 8: Dagre layout produces left-to-right node positions**
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

import * as fc from 'fast-check';
import { Node, Edge } from '@xyflow/react';
import {
  applyDagreLayout,
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
  position: fc.record({ x: fc.integer({ min: 0, max: 1000 }), y: fc.integer({ min: 0, max: 1000 }) }),
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
    position: { x: Math.random() * 1000, y: Math.random() * 1000 }, // Random initial position
    data,
  }));


/**
 * Generates a connected graph with source node and tool nodes in a linear chain
 */
const connectedGraphArb = fc
  .array(toolIdArb, { minLength: 1, maxLength: 5 })
  .chain((toolIds) => {
    const nodeIds = toolIds.map((_, i) => `tool-${i}`);
    const sourceGen = sourceNodeArb;
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

      return { nodes, edges, nodeIds };
    });
  });

/**
 * Generates a branching graph where source connects to multiple tools
 */
const branchingGraphArb = fc
  .array(toolIdArb, { minLength: 2, maxLength: 4 })
  .chain((toolIds) => {
    const nodeIds = toolIds.map((_, i) => `tool-${i}`);
    const sourceGen = sourceNodeArb;
    const toolNodesGen = fc.tuple(
      ...toolIds.map((toolId, i) => toolNodeArb(nodeIds[i], toolId))
    );

    return fc.tuple(sourceGen, toolNodesGen).map(([source, toolNodes]) => {
      const nodes: Node<GraphNodeData>[] = [source, ...toolNodes];

      // Create edges: source -> all tools (parallel branches)
      const edges: Edge[] = nodeIds.map((nodeId, i) => ({
        id: `edge-source-${i}`,
        source: 'source',
        target: nodeId,
      }));

      return { nodes, edges, nodeIds };
    });
  });

describe('Property 8: Dagre layout produces left-to-right node positions', () => {
  /**
   * **Feature: node-graph-architecture, Property 8: Dagre layout produces left-to-right node positions**
   *
   * For any graph with connected nodes, when dagre auto-layout is applied, nodes SHALL have
   * x-coordinates that increase following the direction of edges (left-to-right flow).
   *
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */

  it('should position source node to the left of connected tool nodes', () => {
    fc.assert(
      fc.property(connectedGraphArb, ({ nodes, edges }) => {
        const layoutedNodes = applyDagreLayout(nodes, edges);

        const sourceNode = layoutedNodes.find((n) => n.id === 'source');
        const toolNodes = layoutedNodes.filter((n) => n.id !== 'source');

        expect(sourceNode).toBeDefined();

        // Source should be to the left of all tool nodes
        for (const toolNode of toolNodes) {
          expect(sourceNode!.position.x).toBeLessThan(toolNode.position.x);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should position nodes in left-to-right order following edges', () => {
    fc.assert(
      fc.property(connectedGraphArb, ({ nodes, edges, nodeIds }) => {
        const layoutedNodes = applyDagreLayout(nodes, edges);

        // For a linear chain, each subsequent node should be to the right
        for (let i = 0; i < nodeIds.length - 1; i++) {
          const currentNode = layoutedNodes.find((n) => n.id === nodeIds[i]);
          const nextNode = layoutedNodes.find((n) => n.id === nodeIds[i + 1]);

          expect(currentNode).toBeDefined();
          expect(nextNode).toBeDefined();
          expect(currentNode!.position.x).toBeLessThan(nextNode!.position.x);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should position parallel branches at similar x-coordinates', () => {
    fc.assert(
      fc.property(branchingGraphArb, ({ nodes, edges, nodeIds }) => {
        const layoutedNodes = applyDagreLayout(nodes, edges);

        // All tool nodes connected directly to source should have similar x positions
        const toolNodePositions = nodeIds.map((id) => {
          const node = layoutedNodes.find((n) => n.id === id);
          return node?.position.x ?? 0;
        });

        // All should be at the same rank (same x position within tolerance)
        const firstX = toolNodePositions[0];
        for (const x of toolNodePositions) {
          // Allow small tolerance for floating point
          expect(Math.abs(x - firstX)).toBeLessThan(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should return empty array for empty input', () => {
    const result = applyDagreLayout([], []);
    expect(result).toHaveLength(0);
  });

  it('should preserve node count after layout', () => {
    fc.assert(
      fc.property(connectedGraphArb, ({ nodes, edges }) => {
        const layoutedNodes = applyDagreLayout(nodes, edges);
        expect(layoutedNodes).toHaveLength(nodes.length);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve node IDs and data after layout', () => {
    fc.assert(
      fc.property(connectedGraphArb, ({ nodes, edges }) => {
        const layoutedNodes = applyDagreLayout(nodes, edges);

        for (const originalNode of nodes) {
          const layoutedNode = layoutedNodes.find(
            (n) => n.id === originalNode.id
          );
          expect(layoutedNode).toBeDefined();
          expect(layoutedNode!.data).toEqual(originalNode.data);
          expect(layoutedNode!.type).toEqual(originalNode.type);
        }
      }),
      { numRuns: 100 }
    );
  });
});
