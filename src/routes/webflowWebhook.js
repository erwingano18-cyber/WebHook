const express = require("express");
const crypto = require("crypto");

const { addLead, updateLead } = require("../store");
const { sendLeadEmail } = require("../services");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Webhook router is active.",
    endpoint: "/webhook/webflow",
    method: "POST",
  });
});

router.get("/webflow", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Webflow webhook endpoint is reachable.",
    expectedMethod: "POST",
  });
});

function normalizeFields(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const candidate =
    payload.data && typeof payload.data === "object" ? payload.data : payload;

  if (Array.isArray(candidate.fields)) {
    const result = {};
    candidate.fields.forEach((field) => {
      if (field && field.name) {
        result[field.name] = field.value;
      }
    });
    return result;
  }

  if (candidate.payload && typeof candidate.payload === "object") {
    const inner = candidate.payload;
    // Webflow v2: { triggerType, payload: { data: { fieldName: value }, name, submittedAt, ... } }
    // The actual form field key-values are inside payload.data
    if (
      inner.data &&
      typeof inner.data === "object" &&
      !Array.isArray(inner.data)
    ) {
      return inner.data;
    }
    return inner;
  }

  return candidate;
}

function extractLeadFromPayload(payload) {
  const fields = normalizeFields(payload);

  const entries = Object.entries(fields);
  const emailEntry = entries.find(([key]) => /email/i.test(key));
  const nameEntry = entries.find(([key]) => /name/i.test(key));
  const phoneEntry = entries.find(([key]) => /phone|mobile|tel/i.test(key));
  const messageEntry = entries.find(([key]) =>
    /message|note|comment/i.test(key),
  );

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: "webflow",
    name: nameEntry ? String(nameEntry[1] || "") : "",
    email: emailEntry ? String(emailEntry[1] || "") : "",
    phone: phoneEntry ? String(phoneEntry[1] || "") : "",
    message: messageEntry ? String(messageEntry[1] || "") : "",
    fields,
    rawPayload: payload,
    emailForwarded: false,
    suiteCrmSynced: false,
  };
}

function checkWebhookSecret(req, res, next) {
  const expectedSecret = process.env.WEBFLOW_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return next();
  }

  // Accept secret via header (API/server-side callers) or query param (Webflow native form action)
  const headerSecret = req.headers["x-webhook-secret"];
  const querySecret = req.query.secret;
  if (headerSecret !== expectedSecret && querySecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized webhook call." });
  }

  return next();
}

router.post("/webflow", checkWebhookSecret, async (req, res) => {
  try {
    const lead = extractLeadFromPayload(req.body);
    const savedLead = await addLead(lead);

    try {
      const result = await sendLeadEmail(savedLead);
      if (!result.skipped) {
        await updateLead(savedLead.id, {
          emailForwarded: true,
          emailForwardedAt: new Date().toISOString(),
        });
      }
    } catch (emailError) {
      await updateLead(savedLead.id, { emailForwardError: emailError.message });
    }

    res.status(201).json({ success: true, leadId: savedLead.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
