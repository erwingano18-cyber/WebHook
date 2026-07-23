const axios = require("axios");
const nodemailer = require("nodemailer");

let cachedSuiteToken = null;
let tokenExpiryTime = 0;

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function createMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } =
    process.env;

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

async function sendLeadEmail(lead) {
  const enabled = parseBoolean(process.env.AUTO_FORWARD_ENABLED, true);
  const to = process.env.FORWARD_TO_EMAIL;
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

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
      attributes: {
        first_name: firstName,
        last_name: lastName,
        email1: lead.email || "",
        phone_work: lead.phone || "",
        description: lead.message || JSON.stringify(lead.fields || {}),
      },
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
  parseBoolean,
  sendLeadEmail,
  pushLeadToSuiteCrm,
};
