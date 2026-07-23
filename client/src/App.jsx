import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchConfig,
  fetchLeads,
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

function App() {
  const dispatch = useDispatch();
  const { items, status, config, error, actionById } = useSelector(
    (state) => state.leads,
  );

  useEffect(() => {
    dispatch(fetchLeads());
    dispatch(fetchConfig());

    const timer = setInterval(() => {
      dispatch(fetchLeads());
    }, 15000);

    return () => clearInterval(timer);
  }, [dispatch]);

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
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Message</th>
              <th>Email</th>
              <th>SuiteCRM</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr>
                <td colSpan="8" className="empty">
                  No leads yet.
                </td>
              </tr>
            ) : (
              items.map((lead) => {
                const action = actionById[lead.id];
                return (
                  <tr key={lead.id}>
                    <td>{formatDate(lead.createdAt)}</td>
                    <td>{lead.name || "-"}</td>
                    <td>{lead.email || "-"}</td>
                    <td>{lead.phone || "-"}</td>
                    <td className="msg">{lead.message || "-"}</td>
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
                      <div className="actions">
                        <button
                          className="btn btn-secondary"
                          disabled={
                            lead.emailForwarded || action === "forwarding"
                          }
                          onClick={() => dispatch(runForwardEmail(lead.id))}
                        >
                          {action === "forwarding"
                            ? "Forwarding..."
                            : "Forward Email"}
                        </button>
                        <button
                          className="btn btn-primary"
                          disabled={lead.suiteCrmSynced || action === "syncing"}
                          onClick={() => dispatch(runSuiteSync(lead.id))}
                        >
                          {action === "syncing"
                            ? "Syncing..."
                            : "Add to SuiteCRM"}
                        </button>
                      </div>
                    </td>
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

export default App;
