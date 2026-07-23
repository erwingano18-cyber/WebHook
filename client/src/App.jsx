import { Fragment, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import DataTable from "datatables.net-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";
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
  const tableRef = useRef(null);
  const dataTableRef = useRef(null);

  useEffect(() => {
    dispatch(fetchLeads());
    dispatch(fetchConfig());

    const timer = setInterval(() => {
      dispatch(fetchLeads());
    }, 15000);

    return () => clearInterval(timer);
  }, [dispatch]);

  useEffect(() => {
    if (!tableRef.current || items.length === 0) {
      if (dataTableRef.current) {
        dataTableRef.current.destroy();
        dataTableRef.current = null;
      }
      return;
    }

    if (dataTableRef.current) {
      dataTableRef.current.destroy();
      dataTableRef.current = null;
    }

    dataTableRef.current = new DataTable(tableRef.current, {
      pageLength: 10,
      lengthMenu: [10, 25, 50, 100],
      order: [[0, "desc"]],
      autoWidth: false,
      columnDefs: [{ targets: [2, 5], orderable: false }],
      language: {
        search: "Search leads:",
        lengthMenu: "Show _MENU_",
        info: "Showing _START_ to _END_ of _TOTAL_ leads",
        infoEmpty: "No leads available",
        zeroRecords: "No matching leads found",
      },
    });

    return () => {
      if (dataTableRef.current) {
        dataTableRef.current.destroy();
        dataTableRef.current = null;
      }
    };
  }, [items]);

  const forwardedCount = items.filter((item) => item.emailForwarded).length;
  const syncedCount = items.filter((item) => item.suiteCrmSynced).length;

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
        <table ref={tableRef} id="leadsTable">
          <thead>
            <tr>
              <th>Received</th>
              <th>Form</th>
              <th>Data</th>
              <th>Email</th>
              <th>SuiteCRM</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr>
                <td colSpan="6" className="empty">
                  No leads yet.
                </td>
              </tr>
            ) : (
              items.map((lead) => {
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
                            className="btn btn-secondary btn-kebab"
                            aria-label="Open lead actions"
                            onClick={() =>
                              setOpenMenuId(
                                openMenuId === lead.id ? null : lead.id,
                              )
                            }
                          >
                            ...
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
      </div>
    </div>
  );
}

export default App;
