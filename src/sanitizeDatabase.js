require("dotenv").config();

const { getPool, initializeDatabase } = require("./db");

const LINK_PATTERN =
  /(?:https?:\/\/|ftp:\/\/|www\.|(?<![@\w])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|\b))/i;

function sanitizeValue(value) {
  if (value === false || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && !LINK_PATTERN.test(trimmed) ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map(sanitizeValue)
      .filter((item) => item !== undefined);
    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }

  if (typeof value === "object") {
    const sanitizedObject = {};
    for (const [key, innerValue] of Object.entries(value)) {
      const sanitizedInner = sanitizeValue(innerValue);
      if (sanitizedInner !== undefined) {
        sanitizedObject[key] = sanitizedInner;
      }
    }

    return Object.keys(sanitizedObject).length > 0
      ? sanitizedObject
      : undefined;
  }

  return value;
}

function sanitizeTextColumn(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseJsonOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return { parsed: null, parseError: null };
  }

  try {
    return { parsed: JSON.parse(value), parseError: null };
  } catch (error) {
    return { parsed: null, parseError: error };
  }
}

function jsonForDb(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function valuesDiffer(left, right) {
  return left !== right;
}

async function sanitizeLeadsTable(pool) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        source,
        name,
        email,
        phone,
        message,
        fields_json,
        raw_payload_json,
        suitecrm_response_json,
        spam_reasons_json,
        email_forward_error,
        suitecrm_error,
        spam_label
      FROM leads
    `,
  );

  let updatedCount = 0;
  let invalidJsonCount = 0;

  for (const row of rows) {
    const fields = parseJsonOrNull(row.fields_json);
    const rawPayload = parseJsonOrNull(row.raw_payload_json);
    const suiteResponse = parseJsonOrNull(row.suitecrm_response_json);
    const spamReasons = parseJsonOrNull(row.spam_reasons_json);

    if (
      fields.parseError ||
      rawPayload.parseError ||
      suiteResponse.parseError ||
      spamReasons.parseError
    ) {
      invalidJsonCount += 1;
      continue;
    }

    const sanitizedSource = sanitizeTextColumn(row.source) || "webflow";
    const sanitizedName = sanitizeTextColumn(row.name);
    const sanitizedEmail = sanitizeTextColumn(row.email);
    const sanitizedPhone = sanitizeTextColumn(row.phone);
    const sanitizedMessage = sanitizeTextColumn(row.message);
    const sanitizedEmailForwardError = sanitizeTextColumn(
      row.email_forward_error,
    );
    const sanitizedSuiteCrmError = sanitizeTextColumn(row.suitecrm_error);
    const sanitizedSpamLabel = sanitizeTextColumn(row.spam_label) || "not_spam";

    const sanitizedFields = sanitizeValue(fields.parsed);
    const sanitizedRawPayload = sanitizeValue(rawPayload.parsed);
    const sanitizedSuiteResponse = sanitizeValue(suiteResponse.parsed);
    const sanitizedSpamReasons = sanitizeValue(spamReasons.parsed);

    const nextFieldsJson = jsonForDb(sanitizedFields);
    const nextRawPayloadJson = jsonForDb(sanitizedRawPayload);
    const nextSuiteResponseJson = jsonForDb(sanitizedSuiteResponse);
    const nextSpamReasonsJson = jsonForDb(sanitizedSpamReasons);

    const hasChanges =
      valuesDiffer(row.source, sanitizedSource) ||
      valuesDiffer(row.name, sanitizedName) ||
      valuesDiffer(row.email, sanitizedEmail) ||
      valuesDiffer(row.phone, sanitizedPhone) ||
      valuesDiffer(row.message, sanitizedMessage) ||
      valuesDiffer(row.email_forward_error, sanitizedEmailForwardError) ||
      valuesDiffer(row.suitecrm_error, sanitizedSuiteCrmError) ||
      valuesDiffer(row.spam_label, sanitizedSpamLabel) ||
      valuesDiffer(row.fields_json, nextFieldsJson) ||
      valuesDiffer(row.raw_payload_json, nextRawPayloadJson) ||
      valuesDiffer(row.suitecrm_response_json, nextSuiteResponseJson) ||
      valuesDiffer(row.spam_reasons_json, nextSpamReasonsJson);

    if (!hasChanges) {
      continue;
    }

    await pool.query(
      `
        UPDATE leads
        SET
          source = ?,
          name = ?,
          email = ?,
          phone = ?,
          message = ?,
          fields_json = ?,
          raw_payload_json = ?,
          suitecrm_response_json = ?,
          spam_reasons_json = ?,
          email_forward_error = ?,
          suitecrm_error = ?,
          spam_label = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        sanitizedSource,
        sanitizedName,
        sanitizedEmail,
        sanitizedPhone,
        sanitizedMessage,
        nextFieldsJson,
        nextRawPayloadJson,
        nextSuiteResponseJson,
        nextSpamReasonsJson,
        sanitizedEmailForwardError,
        sanitizedSuiteCrmError,
        sanitizedSpamLabel,
        row.id,
      ],
    );

    updatedCount += 1;
  }

  return {
    total: rows.length,
    updated: updatedCount,
    skippedInvalidJson: invalidJsonCount,
  };
}

async function sanitizeSpamFingerprintsTable(pool) {
  const [rows] = await pool.query(
    `
      SELECT id, subject_norm, email_norm, phone_norm
      FROM spam_fingerprints
    `,
  );

  let updatedCount = 0;

  for (const row of rows) {
    const sanitizedSubject = sanitizeTextColumn(row.subject_norm);
    const sanitizedEmail = sanitizeTextColumn(row.email_norm);
    const sanitizedPhone = sanitizeTextColumn(row.phone_norm);

    const hasChanges =
      valuesDiffer(row.subject_norm, sanitizedSubject) ||
      valuesDiffer(row.email_norm, sanitizedEmail) ||
      valuesDiffer(row.phone_norm, sanitizedPhone);

    if (!hasChanges) {
      continue;
    }

    await pool.query(
      `
        UPDATE spam_fingerprints
        SET
          subject_norm = ?,
          email_norm = ?,
          phone_norm = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [sanitizedSubject, sanitizedEmail, sanitizedPhone, row.id],
    );

    updatedCount += 1;
  }

  return {
    total: rows.length,
    updated: updatedCount,
  };
}

async function run() {
  await initializeDatabase();
  const pool = getPool();

  try {
    const leadResult = await sanitizeLeadsTable(pool);
    const fingerprintResult = await sanitizeSpamFingerprintsTable(pool);

    console.log("Database sanitization complete.");
    console.log(
      `Leads: ${leadResult.updated}/${leadResult.total} updated, ${leadResult.skippedInvalidJson} skipped due to invalid JSON.`,
    );
    console.log(
      `Spam fingerprints: ${fingerprintResult.updated}/${fingerprintResult.total} updated.`,
    );
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Database sanitization failed:", error.message);
  process.exitCode = 1;
});
