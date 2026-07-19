import type { Database, DbColumn, Page } from "../types";
import { uid } from "../storage";

type Props = {
  page: Page;
  onUpdatePage: (page: Page) => void;
};

function cellValue(row: Database["rows"][0], col: DbColumn): string {
  const v = row.cells[col.id];
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export function DatabaseView({ page, onUpdatePage }: Props) {
  const db: Database = page.database || {
    columns: [],
    rows: [],
  };

  function save(database: Database) {
    onUpdatePage({
      ...page,
      database,
      kind: "database",
      updatedAt: Date.now(),
    });
  }

  function setCell(rowId: string, colId: string, value: string | boolean) {
    save({
      ...db,
      rows: db.rows.map((r) =>
        r.id === rowId
          ? { ...r, cells: { ...r.cells, [colId]: value } }
          : r
      ),
    });
  }

  function addRow() {
    const cells: Record<string, string | number | boolean | null> = {};
    for (const c of db.columns) {
      if (c.type === "checkbox") cells[c.id] = false;
      else if (c.type === "select") cells[c.id] = c.options?.[0] || "";
      else if (c.type === "title") cells[c.id] = "New item";
      else cells[c.id] = "";
    }
    save({ ...db, rows: [...db.rows, { id: uid(), cells }] });
  }

  function deleteRow(rowId: string) {
    save({ ...db, rows: db.rows.filter((r) => r.id !== rowId) });
  }

  function addColumn() {
    const col: DbColumn = {
      id: uid(),
      name: "New property",
      type: "text",
    };
    save({
      columns: [...db.columns, col],
      rows: db.rows.map((r) => ({
        ...r,
        cells: { ...r.cells, [col.id]: "" },
      })),
    });
  }

  function renameColumn(colId: string, name: string) {
    save({
      ...db,
      columns: db.columns.map((c) => (c.id === colId ? { ...c, name } : c)),
    });
  }

  return (
    <div className="db-view">
      <div className="db-toolbar">
        <span className="db-view-label">Table</span>
        <button type="button" className="db-tool-btn" onClick={addRow}>
          + New
        </button>
        <button type="button" className="db-tool-btn" onClick={addColumn}>
          + Property
        </button>
      </div>

      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              {db.columns.map((col) => (
                <th key={col.id}>
                  <input
                    className="db-col-name"
                    value={col.name}
                    onChange={(e) => renameColumn(col.id, e.target.value)}
                  />
                </th>
              ))}
              <th className="db-col-actions" />
            </tr>
          </thead>
          <tbody>
            {db.rows.map((row) => (
              <tr key={row.id}>
                {db.columns.map((col) => (
                  <td key={col.id}>
                    {col.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={!!row.cells[col.id]}
                        onChange={(e) =>
                          setCell(row.id, col.id, e.target.checked)
                        }
                      />
                    ) : col.type === "select" ? (
                      <select
                        className="db-cell-select"
                        value={cellValue(row, col)}
                        onChange={(e) =>
                          setCell(row.id, col.id, e.target.value)
                        }
                      >
                        {(col.options || ["Not started", "In progress", "Done"]).map(
                          (opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          )
                        )}
                      </select>
                    ) : (
                      <input
                        className={`db-cell-input${col.type === "title" ? " is-title" : ""}`}
                        value={cellValue(row, col)}
                        onChange={(e) =>
                          setCell(row.id, col.id, e.target.value)
                        }
                      />
                    )}
                  </td>
                ))}
                <td className="db-col-actions">
                  <button
                    type="button"
                    className="db-row-del"
                    title="Delete row"
                    onClick={() => deleteRow(row.id)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="db-add-row" onClick={addRow}>
        + New page
      </button>
    </div>
  );
}
