"use client";

import { useState, useCallback, useMemo } from "react";

/**
 * Hook for per-column filtering. Maintains a map of column key → Set of selected values.
 * When a column has no filter set, all values pass. When it has a set, only those values pass.
 */
export function useColumnFilters() {
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});

  const setFilter = useCallback((colKey: string, values: Set<string> | null) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!values || values.size === 0) {
        delete next[colKey];
      } else {
        next[colKey] = values;
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setFilters({}), []);

  const activeFilterCount = useMemo(() => Object.keys(filters).length, [filters]);

  const passesFilters = useCallback(
    (getValue: (colKey: string) => string) => {
      for (const [colKey, allowedValues] of Object.entries(filters)) {
        const cellValue = getValue(colKey);
        if (!allowedValues.has(cellValue)) return false;
      }
      return true;
    },
    [filters]
  );

  return { filters, setFilter, clearAll, activeFilterCount, passesFilters };
}
