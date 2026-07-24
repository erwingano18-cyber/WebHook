import { Fragment, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchConfig,
  fetchLeads,
  runDeleteLead,
  runForwardEmail,
  runSuiteSync,
} from "./features/leads/leadsSlice";

function formatDate(date) {
  if (!date) {
    return "-";
  }

  return new Date(date).toLocaleString();
}

function statusBadge(label, type) {
  return <span className={`badge ${type}`}>{label}</span>;
}

function getFormName(lead) {
  const rp = lead.rawPayload;
  if (!rp) return "-";
  if (rp.payload && rp.payload.name) return rp.payload.name;
  if (rp.name) return rp.name;
  if (lead.fields && lead.fields.name) return lead.fields.name;
  return "-";
}

function getFieldData(lead) {
  const f = lead.fields;
  if (!f) return {};
  // old (pre-fix) leads stored the Webflow v2 wrapper; unwrap .data if present
  if (f.data && typeof f.data === "object" && !Array.isArray(f.data))
    return f.data;
  return f;
}

function App() {
  const dispatch = useDispatch();
  const { items, status, config, error, actionById } = useSelector(
    (state) => state.leads,
  );
  const [expandedId, setExpandedId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(0);
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    dispatch(fetchLeads());
    dispatch(fetchConfig());

    const timer = setInterval(() => {
      dispatch(fetchLeads());
    }, 15000);

    return () => clearInterval(timer);
  }, [dispatch]);

  useEffect(() => {
    setPage(0);
  }, [search, sortCol, sortDir, pageSize]);

  const forwardedCount = items.filter((item) => item.emailForwarded).length;
  const syncedCount = items.filter((item) => item.suiteCrmSynced).length;

  const q = search.toLowerCase();
  const filtered = items.filter((lead) => {
    if (!q) return true;
    const fields = getFieldData(lead);
    return (
      getFormName(lead).toLowerCase().includes(q) ||
      JSON.stringify(fields).toLowerCase().includes(q)
    );
  });

  const SORTABLE = [0, 1];
  const sorted = [...filtered].sort((a, b) => {
    if (!SORTABLE.includes(sortCol)) return 0;
    const valA = sortCol === 0 ? a.createdAt : getFormName(a);
    const valB = sortCol === 0 ? b.createdAt : getFormName(b);
    const cmp = String(valA).localeCompare(String(valB));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  function toggleSort(col) {
    if (!SORTABLE.includes(col)) return;
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function sortIndicator(col) {
    if (sortCol !== col) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Node.js + Express + MySQL</p>
          <h1>Webflow Leads Dashboard</h1>
          <p className="sub">
            React + Vite + Redux frontend connected to your webhook backend.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => dispatch(fetchLeads())}
        >
          Refresh
        </button>
      </header>

      <section className="stats">
        <article className="card">
          <p>Total Leads</p>
          <strong>{items.length}</strong>
        </article>
        <article className="card">
          <p>Forwarded Emails</p>
          <strong>{forwardedCount}</strong>
        </article>
        <article className="card">
          <p>SuiteCRM Synced</p>
          <strong>{syncedCount}</strong>
        </article>
        <article className="card">
          <p>Config</p>
          <strong className="small">
            {config
              ? `AutoForward ${config.autoForwardEnabled ? "ON" : "OFF"} | Email ${config.forwardToEmail ? "SET" : "MISSING"} | SuiteCRM ${config.suiteCrmConfigured ? "READY" : "MISSING"}`
              : "Loading..."}
          </strong>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {status === "loading" && items.length === 0 ? (
        <p className="loading">Loading leads...</p>
      ) : null}

      <div className="tableWrap">
        <div className="dt-controls">
          <div className="dt-left">
            <label>
              Show{" "}
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>{" "}
              entries
            </label>
          </div>
          <div className="dt-right">
            <label>
              Search:{" "}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter leads…"
              />
            </label>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort(0)}>
                Received{sortIndicator(0)}
              </th>
              <th className="sortable" onClick={() => toggleSort(1)}>
                Form{sortIndicator(1)}
              </th>
              <th>Data</th>
              <th>Email</th>
              <th>SuiteCRM</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!paged.length ? (
              <tr>
                <td colSpan="6" className="empty">
                  {search ? "No matching leads." : "No leads yet."}
                </td>
              </tr>
            ) : (
              paged.map((lead) => {
                const action = actionById[lead.id];
                return (
                  <Fragment key={lead.id}>
                    <tr key={lead.id}>
                      <td>{formatDate(lead.createdAt)}</td>
                      <td className="form-name">{getFormName(lead)}</td>
                      <td className="data-json">
                        <pre className="fields-pre">
                          {JSON.stringify(getFieldData(lead), null, 2)}
                        </pre>
                      </td>
                      <td>
                        {lead.emailForwarded
                          ? statusBadge("Forwarded", "ok")
                          : lead.emailForwardError
                            ? statusBadge("Error", "danger")
                            : statusBadge("Pending", "warn")}
                      </td>
                      <td>
                        {lead.suiteCrmSynced
                          ? statusBadge("Synced", "ok")
                          : lead.suiteCrmError
                            ? statusBadge("Error", "danger")
                            : statusBadge("Pending", "warn")}
                      </td>
                      <td>
                        <div className="actions actions-menu-wrap">
                          <button
                            className=""
                            aria-label="Open lead actions"
                            onClick={() =>
                              setOpenMenuId(
                                openMenuId === lead.id ? null : lead.id,
                              )
                            }
                          >
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                          </button>

                          {openMenuId === lead.id ? (
                            <div className="actions-menu">
                              <button
                                className="actions-item"
                                disabled={
                                  lead.emailForwarded || action === "forwarding"
                                }
                                onClick={() => {
                                  dispatch(runForwardEmail(lead.id));
                                  setOpenMenuId(null);
                                }}
                              >
                                {action === "forwarding"
                                  ? "Forwarding..."
                                  : "Forward Email"}
                              </button>
                              <button
                                className="actions-item"
                                disabled={
                                  lead.suiteCrmSynced || action === "syncing"
                                }
                                onClick={() => {
                                  dispatch(runSuiteSync(lead.id));
                                  setOpenMenuId(null);
                                }}
                              >
                                {action === "syncing"
                                  ? "Syncing..."
                                  : "Add to SuiteCRM"}
                              </button>
                              <button
                                className="actions-item"
                                onClick={() => {
                                  setExpandedId(
                                    expandedId === lead.id ? null : lead.id,
                                  );
                                  setOpenMenuId(null);
                                }}
                              >
                                {expandedId === lead.id
                                  ? "Hide Payload"
                                  : "View Payload"}
                              </button>
                              <button
                                className="actions-item danger"
                                disabled={action === "deleting"}
                                onClick={() => {
                                  const ok = window.confirm(
                                    "Remove this lead permanently?",
                                  );
                                  if (!ok) return;
                                  dispatch(runDeleteLead(lead.id));
                                  setOpenMenuId(null);
                                  if (expandedId === lead.id) {
                                    setExpandedId(null);
                                  }
                                }}
                              >
                                {action === "deleting"
                                  ? "Removing..."
                                  : "Delete / Remove"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {expandedId === lead.id && (
                      <tr key={`${lead.id}-payload`}>
                        <td colSpan="6" className="payload-cell">
                          <pre className="payload-pre">
                            {JSON.stringify(lead.rawPayload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>

        <div className="dt-footer">
          <span className="dt-info">
            {sorted.length === 0
              ? "No leads"
              : `Showing ${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, sorted.length)} of ${sorted.length} leads`}
          </span>
          <div className="dt-pagination">
            <button
              className="btn btn-secondary dt-page-btn"
              disabled={safePage === 0}
              onClick={() => setPage(0)}
            >
              «
            </button>
            <button
              className="btn btn-secondary dt-page-btn"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹
            </button>
            <span className="dt-page-num">
              {safePage + 1} / {totalPages}
            </span>
            <button
              className="btn btn-secondary dt-page-btn"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              ›
            </button>
            <button
              className="btn btn-secondary dt-page-btn"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
            >
              »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
