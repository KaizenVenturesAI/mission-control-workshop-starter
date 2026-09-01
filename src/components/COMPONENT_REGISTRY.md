# Mission Control Component Registry

## StandardTable (MANDATORY for all tables)

**File:** `src/components/StandardTable.tsx`
**Import:** `import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";`

### What it provides (automatically):
- Column sort (click header: ▲/▼ active, ▽ inactive)
- Excel-style filter dropdowns per column
- Drag-and-drop column reorder (persists to localStorage)
- TableManagement button (reorder/reset columns)
- Active filter count bar with "Clear all"
- Empty state message
- Row hover + selection highlighting
- Consistent Example Client dark theme styling

### Usage:
```tsx
const columns: StandardTableColumn<MyRow>[] = [
  { key: "name", label: "Name", getValue: (r) => r.name },
  { key: "email", label: "Email" },
  { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
  { key: "actions", label: "", sortable: false, filterable: false, align: "right",
    render: (r) => <button onClick={() => edit(r)}>Edit</button> },
];

<StandardTable
  tableKey="my-table"          // unique key for localStorage persistence
  columns={columns}
  data={rows}
  getRowKey={(r) => r.id}
  defaultSortKey="name"
  onRowClick={(r) => setSelected(r.id)}
  selectedRowKey={selectedId}
  toolbar={<button>+ Add</button>}  // renders next to TableManagement button
  emptyMessage="No data found"
/>
```

### Column Definition Interface:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| key | string | required | Unique column key |
| label | string | required | Header label |
| sortable | boolean | true | Enable sorting |
| filterable | boolean | true | Enable filter dropdown |
| render | (row, index) => ReactNode | auto | Custom cell renderer |
| getValue | (row) => string | row[key] | Value for sort/filter |
| align | "left" \| "center" \| "right" | "left" | Text alignment |
| minWidth | number | - | Min column width px |
| maxWidth | number | - | Max column width px |
| truncate | boolean | false | Ellipsis overflow |

### Rules:
1. **NEVER use raw `<table>` elements.** Always use StandardTable.
2. **NEVER copy-paste table sort/filter logic.** It's all in StandardTable.
3. **NEVER import ColumnFilterDropdown, TableManagement, useColumnOrder, or useColumnFilters directly** in page components. StandardTable handles all of these internally.
4. If you need custom behavior not covered by StandardTable props, **add the prop to StandardTable**, don't build around it.

---

## ColumnFilterDropdown (INTERNAL — used by StandardTable only)

**File:** `src/components/ColumnFilterDropdown.tsx`
**DO NOT import directly.** StandardTable uses this internally.

## TableManagement (INTERNAL — used by StandardTable only)

**File:** `src/components/TableManagement.tsx`
**DO NOT import directly.** StandardTable uses this internally.

## useColumnOrder (INTERNAL — used by StandardTable only)

**File:** `src/lib/useColumnOrder.ts`
**DO NOT import directly.** StandardTable uses this internally.

## useColumnFilters (INTERNAL — used by StandardTable only)

**File:** `src/lib/useColumnFilters.ts`
**DO NOT import directly.** StandardTable uses this internally.

---

## Migration Status

| Component | Uses StandardTable? | Status |
|-----------|-------------------|--------|
| PermissionsView (User Management) | ✅ Yes | Migrated |
| AgenticOrgChart | ✅ Yes | Migrated |
| ActionBoard (List) | ✅ Yes | Migrated |
| UsageSpend | ✅ Yes | Migrated |
| PeopleOrgChart | ✅ Yes | Migrated |
| CompensationDashboard | ✅ Yes | Migrated |
| PayrollDashboard | ✅ Yes | Migrated |
| PerformanceReviewsDashboard | ✅ Yes | Migrated |
| RevenueDashboard | ✅ Yes | Migrated |
| AgentDirectory | ✅ Yes | Migrated |
| ContactsView | ✅ Yes | Migrated |
| AccountsView | ✅ Yes | Migrated |
| PermissionsView | ⚠️ Legacy | Uses ColumnFilterDropdown directly (2500 lines) |

---

## API Call Rule (MANDATORY)

Every `fetch()` call that performs a mutation (POST/PUT/DELETE) MUST check `response.ok` before treating the result as success:

```tsx
const res = await fetch("/api/endpoint", { method: "POST", ... });
if (!res.ok) throw new Error(`API returned ${res.status}`);
```

Do NOT assume a completed fetch = success. The API may return 400/500 with error JSON.

---

## CRMPicker (MANDATORY for all CRM form fields)

**File:** `src/components/CRMPicker.tsx`
**Import:** `import { CRMPicker, AccountPicker, ContactPicker, EnumPicker } from "@/components/CRMPicker";`

### What it provides:
- Searchable dropdown with type-to-filter
- Keyboard navigation (arrows, Enter, Escape)
- Portal-rendered dropdown (no z-index issues)
- Click-outside-to-close
- Grouped options (e.g. accounts by type)
- Color dots for enum options
- Secondary labels (email, market, etc.)
- "+ Create new" option for object pickers
- Cascading filters (ContactPicker filters by selected accountId)

### Wrapper Components:
- **EnumPicker** — for picklist enums. Takes `picklistKey` string, auto-loads from `picklists.ts`
- **AccountPicker** — self-fetching, groups by account type, shows market subtitle
- **ContactPicker** — self-fetching, filters by accountId, shows email subtitle

### Picklist Registry:
**File:** `src/lib/crm/picklists.ts`
All CRM enum options MUST be defined here. Never hardcode option arrays in components.

### Rules:
1. **No raw `<select>` in CRM forms.** Use CRMPicker or a wrapper.
2. **All enum options live in `picklists.ts`.** No inline arrays.
3. **Object pickers cascade.** Account selection filters contacts.
4. **Every picker supports keyboard navigation.**

---

## CRM Lifecycle (status transitions)

**File:** `src/lib/crm/lifecycle.ts`

Manages status mapping and transition validation across Leads, Contacts, and Opportunities.
- `LEAD_TO_CONTACT_STAGE` / `LEAD_TO_OPPORTUNITY_STAGE` — mapping constants
- `isValidLeadTransition()` / `isValidOpportunityTransition()` — forward-only validation
- `getValidLeadTransitions()` / `getValidOpportunityTransitions()` — valid next states
- `computeLinkedUpdates()` — what linked objects should become

**API:** `POST /api/crm/lifecycle` — use for all status changes (cascades to linked objects)

---

*Last updated: 2026-04-12*
*Owner: Example Client Mission Agent / Engineering*
