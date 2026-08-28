const express = require("express");
const crypto = require("crypto");

const { addLead, updateLead } = require("../store");
const {
  classifyLeadSpam,
  parseBoolean,
  sendLeadEmail,
} = require("../services");

const router = express.Router();

const LINK_PATTERN =
  /(?:https?:\/\/|ftp:\/\/|www\.|(?<![@\w])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|\b))/i;

function containsLink(value) {
  if (typeof value === "string") {
    return LINK_PATTERN.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsLink);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(containsLink);
  }

  return false;
}

function removeFalseAndBlankValues(value) {
  if (value === false || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map(removeFalseAndBlankValues)
      .filter((item) => item !== undefined);
    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }

  if (typeof value === "object") {
    const sanitizedObject = {};
    for (const [key, innerValue] of Object.entries(value)) {
      const sanitizedValue = removeFalseAndBlankValues(innerValue);
      if (sanitizedValue !== undefined) {
        sanitizedObject[key] = sanitizedValue;
      }
    }
    return Object.keys(sanitizedObject).length > 0
      ? sanitizedObject
      : undefined;
  }

  return value;
}

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
    return removeFalseAndBlankValues(result) || {};
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
      return removeFalseAndBlankValues(inner.data) || {};
    }
    return removeFalseAndBlankValues(inner) || {};
  }

  return removeFalseAndBlankValues(candidate) || {};
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
    const fields = normalizeFields(req.body);
    if (containsLink(fields)) {
      return res.status(400).json({
        success: false,
        error: "Links are not allowed in lead fields.",
      });
    }

    const lead = extractLeadFromPayload(req.body);
    const spamResult = await classifyLeadSpam(lead);
    lead.spamScore = spamResult.score;
    lead.spamLabel = spamResult.label;
    lead.spamReasons = spamResult.reasons;

    const savedLead = await addLead(lead);
    let emailForwarded = false;
    let emailForwardError = null;
    const forwardSpamLeads = parseBoolean(
      process.env.FORWARD_SPAM_LEADS,
      false,
    );

    if (savedLead.spamLabel === "spam" && !forwardSpamLeads) {
      emailForwardError = "Skipped: lead classified as spam";
      await updateLead(savedLead.id, {
        emailForwardError,
      });
    } else {
      try {
        const result = await sendLeadEmail(savedLead);
        if (!result.skipped) {
          emailForwarded = true;
          await updateLead(savedLead.id, {
            emailForwarded: true,
            emailForwardedAt: new Date().toISOString(),
          });
        } else {
          emailForwardError = result.reason;
          await updateLead(savedLead.id, {
            emailForwardError: result.reason,
          });
        }
      } catch (emailError) {
        emailForwardError = emailError.message;
        await updateLead(savedLead.id, {
          emailForwardError: emailError.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      leadId: savedLead.id,
      emailForwarded,
      emailForwardError,
      spamLabel: savedLead.spamLabel,
      spamScore: savedLead.spamScore,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
