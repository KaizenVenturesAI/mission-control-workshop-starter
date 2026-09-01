"use client";

import { useState, useCallback, useRef } from "react";

/**
 * Reusable hook for draggable column reordering across all Mission Control tables.
 * Persists column order to localStorage per table key.
 *
 * Usage:
 *   const { orderedColumns, dragHandlers } = useColumnOrder("hr-org-chart", defaultColumns);
 *   // In <th>: spread dragHandlers(colIndex)
 */

export interface ColumnDef<K extends string = string> {
  key: K;
  label: string;
  sortable?: boolean;
}

export function useColumnOrder<K extends string>(
  storageKey: string,
  defaultColumns: ColumnDef<K>[]
) {
  const [columnOrder, setColumnOrder] = useState<K[]>(() => {
    if (typeof window === "undefined") return defaultColumns.map((c) => c.key);
    try {
      const stored = window.localStorage.getItem(`col-order-${storageKey}`);
      if (stored) {
        const parsed = JSON.parse(stored) as K[];
        // Validate all default keys are present
        const defaultKeys = new Set(defaultColumns.map((c) => c.key));
        if (parsed.length === defaultKeys.size && parsed.every((k) => defaultKeys.has(k))) {
          return parsed;
        }
      }
    } catch { /* fall through */ }
    return defaultColumns.map((c) => c.key);
  });

  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  const orderedColumns = columnOrder.map((key) => defaultColumns.find((c) => c.key === key)!).filter(Boolean);

  const persistOrder = useCallback((order: K[]) => {
    setColumnOrder(order);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`col-order-${storageKey}`, JSON.stringify(order));
      } catch {
        /* non-critical table preference */
      }
    }
  }, [storageKey]);

  const dragHandlers = useCallback((index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = "move";
      // Make the drag image slightly transparent
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.5";
      }
    },
    onDragEnd: (e: React.DragEvent) => {
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "1";
      }
      dragIndexRef.current = null;
      dragOverIndexRef.current = null;
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      dragOverIndexRef.current = index;
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.borderLeft = "2px solid #60a5fa";
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.borderLeft = "";
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.borderLeft = "";
      }
      const from = dragIndexRef.current;
      const to = index;
      if (from === null || from === to) return;
      const newOrder = [...columnOrder];
      const [moved] = newOrder.splice(from, 1);
      newOrder.splice(to, 0, moved);
      persistOrder(newOrder);
    },
    style: { cursor: "grab" } as React.CSSProperties,
  }), [columnOrder, persistOrder]);

  const reorderColumns = useCallback((newColumns: ColumnDef<K>[]) => {
    const newOrder = newColumns.map((c) => c.key);
    persistOrder(newOrder);
  }, [persistOrder]);

  return { orderedColumns, columnOrder, dragHandlers, reorderColumns };
}
