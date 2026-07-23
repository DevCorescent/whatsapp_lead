"use client";

import { useCallback, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const MAX_HISTORY = 100;

/**
 * Canvas state + undo/redo history for the flow editor.
 *
 * History uses the standard "snapshot before a structural change" model: callers
 * invoke `takeSnapshot()` at the start of a gesture (drag, connect, add, delete,
 * config edit, paste). Continuous streams (dragging, selection) apply live via
 * onNodesChange/onEdgesChange without polluting history.
 *
 * History is held in state (not refs) so undo/redo availability re-renders the
 * toolbar and nothing is read from a ref during render.
 */
export function useFlowEditor(initialNodes: Node[], initialEdges: Edge[]) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  const takeSnapshot = useCallback(() => {
    setPast((p) => [...p, { nodes: clone(nodes), edges: clone(edges) }].slice(-MAX_HISTORY));
    setFuture([]);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [...f, { nodes: clone(nodes), edges: clone(edges) }]);
    setPast((p) => p.slice(0, -1));
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [past, nodes, edges]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setPast((p) => [...p, { nodes: clone(nodes), edges: clone(edges) }]);
    setFuture((f) => f.slice(0, -1));
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [future, nodes, edges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  /** Replace the whole document and clear history (used on load / after reset). */
  const reset = useCallback((n: Node[], e: Edge[]) => {
    setPast([]);
    setFuture([]);
    setNodes(n);
    setEdges(e);
  }, []);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    takeSnapshot,
    undo,
    redo,
    reset,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
