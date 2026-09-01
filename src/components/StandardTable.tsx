"use client";

/**
 * StandardTable — The single source of truth for all tables in Mission Control.
 *
 * EVERY table in MC must use this component. It provides:
 * - Column sort (click header: ▲/▼ active, ▽ inactive)
 * - Excel-style filter dropdowns per column
 * - Drag-and-drop column reorder (persists to localStorage)
 * - TableManagement button (reorder/reset columns)
 * - Active filter count bar with "Clear all"
 * - Consistent styling matching Example Client dark theme
 *
 * Usage:
 *   <StandardTable
 *     tableKey="settings-users"
 *     columns={[
 *       { key: "name", label: "User", render: (row) => row.name },
 *       { key: "email", label: "Email" },
 *       { key: "role", label: "Role", render: (row) => <Badge>{row.role}</Badge> },
 *       { key: "actions", label: "Actions", sortable: false, filterable: false, render: (row) => <button>Edit</button> },
 *     ]}
 *     data={users}
 *     getRowKey={(row) => row.id}
 *     onRowClick={(row) => setSelected(row.id)}
 *     selectedRowKey={selectedId}
 *     emptyMessage="No users found"
 *   />
 *
 * DO NOT use raw <table> elements. DO NOT copy-paste table logic.
 * If you need custom behavior, extend StandardTableColumn or add a prop here.
 */

import { useState, useMemo, useCallback } from "react";
import { ColumnFilterDropdown } from "@/components/ColumnFilterDropdown";
import { TableManagement } from "@/components/TableManagement";
import { useColumnOrder, type ColumnDef } from "@/lib/useColumnOrder";
import { useColumnFilters } from "@/lib/useColumnFilters";

// ─── Column Definition ───

export interface StandardTableColumn<T = any> {
  /** Unique key for this column. Must match a field name on the row object for auto-sort/filter, or provide getValue. */
  key: string;
  /** Display label in the header */
  label: string;
  /** Whether this column is sortable. Default: true */
  sortable?: boolean;
  /** Whether this column has a filter dropdown. Default: true */
  filterable?: boolean;
  /** Custom render function for the cell. If omitted, displays row[key] as string. */
  render?: (row: T, rowIndex: number) => React.ReactNode;
  /** Extract the string value for sorting and filtering. Runtime values are defensively coerced to string. */
  getValue?: (row: T) => string | number | null | undefined;
  /** Extract a dedicated value for sorting when it should differ from the displayed/filter value. */
  getSortValue?: (row: T) => string | number | null | undefined;
  /** Extract a dedicated value for filtering when it should differ from the displayed/sort value. */
  getFilterValue?: (row: T) => string | number | null | undefined;
  /** Text alignment for this column. Default: "left" */
  align?: "left" | "center" | "right";
  /** Min width in px */
  minWidth?: number;
  /** Max width in px */
  maxWidth?: number;
  /** Whether to truncate overflow with ellipsis. Default: false */
  truncate?: boolean;
  /** Additional styles applied to each <td> cell for this column */
  tdStyle?: React.CSSProperties;
  /** Additional styles applied to the <th> header cell for this column */
  thStyle?: React.CSSProperties;
}

// ─── Table Props ───

export interface StandardTableProps<T> {
  /** Unique key for localStorage persistence (column order, etc.) */
  tableKey: string;
  /** Column definitions */
  columns: StandardTableColumn<T>[];
  /** Row data */
  data: T[];
  /** Extract a unique key for each row */
  getRowKey: (row: T) => string;
  /** Default sort column key */
  defaultSortKey?: string;
  /** Default sort direction */
  defaultSortDir?: "asc" | "desc";
  /** Callback when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Currently selected row key (highlights the row) */
  selectedRowKey?: string | null;
  /** Message when data is empty */
  emptyMessage?: string;
  /** Extra content above the table (e.g. action buttons) */
  toolbar?: React.ReactNode;
  /** Custom row style function */
  getRowStyle?: (row: T) => React.CSSProperties;
  /** Whether to show the filter count bar. Default: true */
  showFilterBar?: boolean;
  /** Whether to show the TableManagement button. Default: true */
  showTableManagement?: boolean;
  /** Whether rows are hoverable. Default: true */
  hoverable?: boolean;
  /** Extra attributes to set on each <tr> row element (e.g. data-* attributes) */
  getRowAttributes?: (row: T) => Record<string, string>;
}

// ─── Component ───

export function StandardTable<T extends Record<string, any>>({
  tableKey,
  columns,
  data,
  getRowKey,
  defaultSortKey,
  defaultSortDir = "asc",
  onRowClick,
  selectedRowKey,
  emptyMessage = "No data",
  toolbar,
  getRowStyle,
  showFilterBar = true,
  showTableManagement = true,
  hoverable = true,
  getRowAttributes,
}: StandardTableProps<T>) {
  // ─── Sort State ───
  const [sortKey, setSortKey] = useState(defaultSortKey ?? columns[0]?.key ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  // ─── Column Order (drag-drop, localStorage) ───
  const colDefs: ColumnDef[] = useMemo(
    () => columns.map((c) => ({ key: c.key, label: c.label })),
    [columns]
  );
  const { orderedColumns, reorderColumns, dragHandlers } = useColumnOrder(tableKey, colDefs);

  // ─── Column Filters ───
  const { filters, activeFilterCount, setFilter, clearAll } = useColumnFilters();

  // ─── Resolve column getValue (hardened: never returns non-string) ───
  const coerceColValue = useCallback((rawValue: unknown): string => {
    if (rawValue == null) return "";
    if (rawValue instanceof Date) return rawValue.toLocaleDateString();
    return String(rawValue);
  }, []);

  const getColValue = useCallback(
    (col: StandardTableColumn<T>, row: T): string => {
      try {
        const rawValue = col.getValue ? col.getValue(row) : row[col.key];
        return coerceColValue(rawValue);
      } catch {
        return "";
      }
    },
    [coerceColValue]
  );

  const getSortValue = useCallback(
    (col: StandardTableColumn<T>, row: T): string => {
      try {
        const rawValue = col.getSortValue ? col.getSortValue(row) : col.getValue ? col.getValue(row) : row[col.key];
        return coerceColValue(rawValue);
      } catch {
        return "";
      }
    },
    [coerceColValue]
  );

  const getFilterValue = useCallback(
    (col: StandardTableColumn<T>, row: T): string => {
      try {
        const rawValue = col.getFilterValue ? col.getFilterValue(row) : col.getValue ? col.getValue(row) : row[col.key];
        return coerceColValue(rawValue);
      } catch {
        return "";
      }
    },
    [coerceColValue]
  );

  // ─── Filter Options (unique values per column) ───
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of columns) {
      if (col.filterable === false) continue;
      const vals = new Set<string>();
      for (const row of data) {
        vals.add(getFilterValue(col, row));
      }
      opts[col.key] = Array.from(vals);
    }
    return opts;
  }, [columns, data, getFilterValue]);

  // ─── Sort + Filter ───
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply filters
    const filterEntries = Object.keys(filters);
    for (const colKey of filterEntries) {
      const selected = filters[colKey];
      if (!selected || !(selected instanceof Set) || selected.size === 0) continue;
      const col = columns.find((c) => c.key === colKey);
      if (!col) continue;
      result = result.filter((row) => selected.has(getFilterValue(col, row)));
    }

    // Apply sort
    const sortCol = columns.find((c) => c.key === sortKey);
    if (sortCol && sortCol.sortable !== false) {
      result.sort((a, b) => {
        const av = getSortValue(sortCol, a) ?? "";
        const bv = getSortValue(sortCol, b) ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [data, filters, sortKey, sortDir, columns, getFilterValue, getSortValue]);

  // ─── Sort Handler ───
  const onSort = useCallback(
    (key: string, dir?: "asc" | "desc") => {
      const col = columns.find((c) => c.key === key);
      if (!col || col.sortable === false) return;
      if (dir) {
        setSortKey(key);
        setSortDir(dir);
        return;
      }
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey, columns]
  );

  // ─── Render ───
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.12)",
        borderRadius: 8,
        background: "rgba(8,13,23,0.52)",
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Toolbar Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 44, padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--color-client-text-muted)", fontSize: 12, fontWeight: 650 }}>
            {processedData.length === data.length
              ? `${data.length} item${data.length !== 1 ? "s" : ""}`
              : `${processedData.length} of ${data.length}`}
          </span>
          {showFilterBar && activeFilterCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#4ade80" }}>
                {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
              </span>
              <button
                onClick={clearAll}
                style={{ fontSize: 11, color: "#93c5fd", background: "transparent", border: "none", cursor: "pointer" }}
              >
                Clear all
              </button>
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {showTableManagement && (
            <TableManagement
              columns={orderedColumns}
              onReorder={reorderColumns}
              onReset={() => reorderColumns(colDefs)}
            />
          )}
          {toolbar}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflow: "auto", maxHeight: "min(72vh, 860px)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              {orderedColumns.map((colDef, index) => {
                const col = columns.find((c) => c.key === colDef.key);
                if (!col) return null;
                const isFilterable = col.filterable !== false && filterOptions[col.key];
                const isActions = col.sortable === false && col.filterable === false;

                return (
                  <th
                    key={col.key}
                    style={{
                      padding: "10px 16px",
                      textAlign: (col.align ?? "left") as any,
                      fontSize: 11,
                      fontWeight: 750,
                      color: "var(--color-client-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      background: "rgba(13,18,30,0.98)",
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      minWidth: col.minWidth,
                      maxWidth: col.maxWidth,
                      ...col.thStyle,
                    }}
                  >
                    {isActions ? (
                      <span>{col.label}</span>
                    ) : (
                      <ColumnFilterDropdown
                        colKey={col.key}
                        label={col.label}
                        allValues={isFilterable ? filterOptions[col.key] : []}
                        activeFilter={filters[col.key] as Set<string> | undefined}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={onSort}
                        onFilter={setFilter}
                        dragProps={dragHandlers(index)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {processedData.length === 0 ? (
              <tr>
                <td
                  colSpan={orderedColumns.length}
                  style={{ padding: 40, textAlign: "center", color: "var(--color-client-text-muted)", fontSize: 14 }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              processedData.map((row, rowIndex) => {
                const rowKey = getRowKey(row);
                const isSelected = selectedRowKey === rowKey;
                const customStyle = getRowStyle?.(row) ?? {};

                return (
                  <tr
                    key={rowKey}
                    {...(getRowAttributes?.(row) ?? {})}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={{
                      cursor: onRowClick ? "pointer" : "default",
                      borderTop: rowIndex === 0 ? "none" : "1px solid rgba(255,255,255,0.055)",
                      background: isSelected ? "rgba(96,165,250,0.075)" : "transparent",
                      boxShadow: isSelected ? "inset 3px 0 0 rgba(96,165,250,0.72)" : undefined,
                      transition: "background 0.15s",
                      ...customStyle,
                    }}
                    onMouseEnter={
                      hoverable && !isSelected
                        ? (e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }
                        : undefined
                    }
                    onMouseLeave={
                      hoverable && !isSelected
                        ? (e) => { e.currentTarget.style.background = customStyle.background as string ?? "transparent"; }
                        : undefined
                    }
                  >
                    {orderedColumns.map((colDef) => {
                      const col = columns.find((c) => c.key === colDef.key);
                      if (!col) return null;

                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: "12px 16px",
                            fontSize: 13,
                            lineHeight: 1.35,
                            textAlign: (col.align ?? "left") as any,
                            color: "var(--color-client-text)",
                            minWidth: col.minWidth,
                            maxWidth: col.maxWidth,
                            overflow: col.truncate ? "hidden" : undefined,
                            textOverflow: col.truncate ? "ellipsis" : undefined,
                            whiteSpace: col.truncate ? "nowrap" : undefined,
                            ...col.tdStyle,
                          }}
                        >
                          {col.render ? col.render(row, rowIndex) : getColValue(col, row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
