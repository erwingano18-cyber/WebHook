const axios = require("axios");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const {
  deleteSpamFingerprintBySourceLeadId,
  findSpamFingerprintMatch,
  upsertSpamFingerprint,
} = require("./store");

let cachedSuiteToken = null;
let tokenExpiryTime = 0;

function cleanEnv(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).trim().toLowerCase() === "true";
}

function createMailer() {
  const SMTP_HOST = cleanEnv(process.env.SMTP_HOST);
  const SMTP_PORT = cleanEnv(process.env.SMTP_PORT);
  const SMTP_SECURE = process.env.SMTP_SECURE;
  const SMTP_USER =
    cleanEnv(process.env.SMTP_USER) || cleanEnv(process.env.EMAIL_FROM);
  const SMTP_PASS = cleanEnv(process.env.SMTP_PASS);

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: parseBoolean(SMTP_SECURE, false),
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function toLeadHtml(lead) {
  return `
    <h2>New Webflow Lead</h2>
    <p><strong>Name:</strong> ${lead.name || "-"} </p>
    <p><strong>Email:</strong> ${lead.email || "-"} </p>
    <p><strong>Phone:</strong> ${lead.phone || "-"} </p>
    <p><strong>Message:</strong> ${lead.message || "-"} </p>
    <p><strong>Received:</strong> ${lead.createdAt}</p>
    <hr>
    <pre>${JSON.stringify(lead.fields, null, 2)}</pre>
  `;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).toLowerCase();
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function normalizeWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
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

function getLeadSubject(lead) {
  const rawPayload = lead.rawPayload;
  if (rawPayload && rawPayload.payload && rawPayload.payload.name) {
    return rawPayload.payload.name;
  }

  if (rawPayload && rawPayload.name) {
    return rawPayload.name;
  }

  if (lead.fields && lead.fields.name) {
    return lead.fields.name;
  }

  return "";
}

function hashNormalizedValue(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function buildLeadSpamFingerprint(lead) {
  const normalizedFields = JSON.stringify(lead.fields || {});

  return {
    sourceLeadId: lead.id,
    subjectNorm: normalizeWhitespace(getLeadSubject(lead)).slice(0, 255),
    emailNorm: normalizeWhitespace(lead.email).slice(0, 255),
    phoneNorm: normalizePhone(lead.phone).slice(0, 80),
    messageHash: hashNormalizedValue(lead.message),
    fieldsHash: hashNormalizedValue(normalizedFields),
  };
}

function hasUsefulFingerprintData(fingerprint) {
  return Boolean(
    fingerprint.messageHash ||
    fingerprint.fieldsHash ||
    (fingerprint.subjectNorm && fingerprint.emailNorm) ||
    (fingerprint.subjectNorm && fingerprint.phoneNorm),
  );
}

async function learnSpamFromLead(lead) {
  const fingerprint = buildLeadSpamFingerprint(lead);
  if (!hasUsefulFingerprintData(fingerprint)) {
    return false;
  }

  await upsertSpamFingerprint(fingerprint);
  return true;
}

async function forgetSpamFromLead(leadId) {
  await deleteSpamFingerprintBySourceLeadId(leadId);
}

async function classifyLeadSpam(lead) {
  const scoreThreshold = Number(process.env.SPAM_SCORE_THRESHOLD || 5);
  const fieldBlob = JSON.stringify(lead.fields || {}).toLowerCase();
  const text = [lead.name, lead.email, lead.phone, lead.message, fieldBlob]
    .map(normalizeText)
    .join(" ");

  let score = 0;
  const reasons = [];

  const hasLinks = countMatches(text, /https?:\/\//g);
  if (hasLinks >= 2) {
    score += 3;
    reasons.push("Contains multiple links");
  } else if (hasLinks === 1) {
    score += 1;
    reasons.push("Contains a link");
  }

  const spamKeywords = [
    /buy now/i,
    /click here/i,
    /guaranteed/i,
    /seo service/i,
    /crypto/i,
    /casino/i,
    /viagra/i,
    /loan/i,
    /whatsapp/i,
    /telegram/i,
  ];
  const matchedKeywords = spamKeywords.filter((keyword) => keyword.test(text));
  if (matchedKeywords.length > 0) {
    score += Math.min(4, matchedKeywords.length + 1);
    reasons.push("Matched common spam keywords");
  }

  const digitsInMessage = countMatches(normalizeText(lead.message), /\d/g);
  if (digitsInMessage >= 12) {
    score += 2;
    reasons.push("Message has excessive numeric content");
  }

  const email = normalizeText(lead.email);
  if (email) {
    const disposableDomainPattern =
      /@(mailinator|guerrillamail|10minutemail|tempmail|trashmail|yopmail)\./i;
    if (disposableDomainPattern.test(email)) {
      score += 4;
      reasons.push("Disposable email domain detected");
    }

    if (/\+[^@]{10,}@/.test(email)) {
      score += 1;
      reasons.push("Email alias appears auto-generated");
    }
  }

  const message = normalizeText(lead.message);
  if (message.length >= 600) {
    score += 2;
    reasons.push("Very long message body");
  }

  if (/([a-z])\1{6,}/i.test(message)) {
    score += 2;
    reasons.push("Repeated character pattern detected");
  }

  const fingerprint = buildLeadSpamFingerprint(lead);
  if (hasUsefulFingerprintData(fingerprint)) {
    const learnedMatch = await findSpamFingerprintMatch(fingerprint);
    if (learnedMatch.matched) {
      score = Math.max(score, scoreThreshold);
      reasons.push(
        `Matched learned spam pattern (${learnedMatch.matchedBy.replace("_", " ")})`,
      );
    }
  }

  const isSpam = score >= scoreThreshold;
  return {
    isSpam,
    label: isSpam ? "spam" : "not_spam",
    score,
    reasons,
    threshold: scoreThreshold,
  };
}

async function sendLeadEmail(lead) {
  const enabled = parseBoolean(process.env.AUTO_FORWARD_ENABLED, true);
  const to = cleanEnv(process.env.FORWARD_TO_EMAIL);
  const from =
    cleanEnv(process.env.EMAIL_FROM) || cleanEnv(process.env.SMTP_USER);

  if (!enabled) {
    return { skipped: true, reason: "AUTO_FORWARD_ENABLED is false" };
  }

  if (!to || !from) {
    return {
      skipped: true,
      reason: "FORWARD_TO_EMAIL or EMAIL_FROM is missing",
    };
  }

  const mailer = createMailer();
  if (!mailer) {
    return { skipped: true, reason: "SMTP settings are incomplete" };
  }

  await mailer.sendMail({
    from,
    to,
    subject: `New Lead: ${lead.name || lead.email || lead.id}`,
    text: JSON.stringify(lead, null, 2),
    html: toLeadHtml(lead),
  });

  return { skipped: false };
}

async function getSuiteCrmToken() {
  if (process.env.SUITECRM_BEARER_TOKEN) {
    return process.env.SUITECRM_BEARER_TOKEN;
  }

  const now = Date.now();
  if (cachedSuiteToken && now < tokenExpiryTime) {
    return cachedSuiteToken;
  }

  const baseUrl = process.env.SUITECRM_BASE_URL;
  const clientId = process.env.SUITECRM_CLIENT_ID || "suitecrm";
  const clientSecret = process.env.SUITECRM_CLIENT_SECRET;
  const username = process.env.SUITECRM_USERNAME;
  const password = process.env.SUITECRM_PASSWORD;

  if (!baseUrl || !clientSecret || !username || !password) {
    throw new Error(
      "SuiteCRM auth config missing. Set SUITECRM_BEARER_TOKEN or OAuth variables.",
    );
  }

  const tokenUrl = `${baseUrl.replace(/\/$/, "")}/Api/access_token`;

  const payload = new URLSearchParams({
    grant_type: "password",
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
  });

  const response = await axios.post(tokenUrl, payload.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const { access_token: token, expires_in: expiresIn = 3600 } =
    response.data || {};
  if (!token) {
    throw new Error("SuiteCRM token response did not include access_token.");
  }

  cachedSuiteToken = token;
  tokenExpiryTime = Date.now() + (Number(expiresIn) - 30) * 1000;
  return token;
}

async function pushLeadToSuiteCrm(lead) {
  const baseUrl = process.env.SUITECRM_BASE_URL;
  if (!baseUrl) {
    throw new Error("SUITECRM_BASE_URL is not configured.");
  }

  const token = await getSuiteCrmToken();
  const endpoint = `${baseUrl.replace(/\/$/, "")}/Api/V8/module`;

  const names = (lead.name || "").trim().split(/\s+/).filter(Boolean);
  const firstName = names.length > 0 ? names[0] : "";
  const lastName =
    names.length > 1 ? names.slice(1).join(" ") : firstName || "Webflow";

  const payload = {
    data: {
      type: "Leads",
      attributes:
        removeFalseAndBlankValues({
          first_name: firstName,
          last_name: lastName,
          email1: lead.email || "",
          phone_work: lead.phone || "",
          description: lead.message || JSON.stringify(lead.fields || {}),
        }) || {},
    },
  };

  const response = await axios.post(endpoint, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

module.exports = {
  forgetSpamFromLead,
  classifyLeadSpam,
  learnSpamFromLead,
  parseBoolean,
  sendLeadEmail,
  pushLeadToSuiteCrm,
};
