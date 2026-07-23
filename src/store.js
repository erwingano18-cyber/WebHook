const { getPool } = require("./db");

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function mapLeadRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    source: row.source,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    message: row.message || "",
    fields: row.fields_json ? JSON.parse(row.fields_json) : {},
    rawPayload: row.raw_payload_json ? JSON.parse(row.raw_payload_json) : {},
    emailForwarded: Boolean(row.email_forwarded),
    emailForwardedAt: row.email_forwarded_at
      ? new Date(row.email_forwarded_at).toISOString()
      : null,
    emailForwardError: row.email_forward_error,
    suiteCrmSynced: Boolean(row.suitecrm_synced),
    suiteCrmSyncedAt: row.suitecrm_synced_at
      ? new Date(row.suitecrm_synced_at).toISOString()
      : null,
    suiteCrmResponse: row.suitecrm_response_json
      ? JSON.parse(row.suitecrm_response_json)
      : null,
    suiteCrmError: row.suitecrm_error,
  };
}

async function addLead(lead) {
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO leads (
        id, created_at, source, name, email, phone, message,
        fields_json, raw_payload_json, email_forwarded, suitecrm_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      lead.id,
      normalizeDate(lead.createdAt) || normalizeDate(new Date()),
      lead.source || "webflow",
      lead.name || "",
      lead.email || "",
      lead.phone || "",
      lead.message || "",
      JSON.stringify(lead.fields || {}),
      JSON.stringify(lead.rawPayload || {}),
      lead.emailForwarded ? 1 : 0,
      lead.suiteCrmSynced ? 1 : 0,
    ],
  );

  return getLeadById(lead.id);
}

async function getLeads() {
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT * FROM leads ORDER BY created_at DESC, id DESC",
  );
  return rows.map(mapLeadRow);
}

async function getLeadById(id) {
  const pool = getPool();
  const [rows] = await pool.query("SELECT * FROM leads WHERE id = ? LIMIT 1", [
    id,
  ]);
  return mapLeadRow(rows[0] || null);
}

async function updateLead(id, updates) {
  const pool = getPool();
  const allowed = {
    source: "source",
    name: "name",
    email: "email",
    phone: "phone",
    message: "message",
    fields: "fields_json",
    rawPayload: "raw_payload_json",
    emailForwarded: "email_forwarded",
    emailForwardedAt: "email_forwarded_at",
    emailForwardError: "email_forward_error",
    suiteCrmSynced: "suitecrm_synced",
    suiteCrmSyncedAt: "suitecrm_synced_at",
    suiteCrmResponse: "suitecrm_response_json",
    suiteCrmError: "suitecrm_error",
  };

  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(updates || {})) {
    if (!Object.prototype.hasOwnProperty.call(allowed, key)) {
      continue;
    }

    const column = allowed[key];
    let out = value;

    if (
      key === "fields" ||
      key === "rawPayload" ||
      key === "suiteCrmResponse"
    ) {
      out = value == null ? null : JSON.stringify(value);
    }

    if (key === "emailForwarded" || key === "suiteCrmSynced") {
      out = value ? 1 : 0;
    }

    if (key === "emailForwardedAt" || key === "suiteCrmSyncedAt") {
      out = normalizeDate(value);
    }

    setClauses.push(`${column} = ?`);
    values.push(out);
  }

  setClauses.push("updated_at = ?");
  values.push(normalizeDate(new Date()));
  values.push(id);

  await pool.query(
    `UPDATE leads SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );
  return getLeadById(id);
}

module.exports = {
  addLead,
  getLeads,
  getLeadById,
  updateLead,
};
