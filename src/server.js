require("dotenv").config();

const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const { deleteLead, getLeads, getLeadById, updateLead } = require("./store");
const { initializeDatabase } = require("./db");
const {
  parseBoolean,
  sendLeadEmail,
  pushLeadToSuiteCrm,
} = require("./services");
const webflowWebhookRouter = require("./routes/webflowWebhook");

const app = express();
const port = Number(process.env.PORT || 3000);
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "");

function getJwtSecret() {
  return process.env.AUTH_JWT_SECRET || process.env.WEBFLOW_WEBHOOK_SECRET;
}

function createSessionToken(user) {
  return jwt.sign(user, getJwtSecret(), {
    expiresIn: "7d",
  });
}

function readSessionToken(req) {
  const cookieToken = req.cookies ? req.cookies.session : null;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  return null;
}

function requireAuth(req, res, next) {
  const token = readSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(cookieParser());

app.get("/api/auth/google/config", (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" });
});

app.get("/api/auth/me", (req, res) => {
  const token = readSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    return res.json({ user: payload });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/api/auth/google", async (req, res) => {
  const credential = req.body ? req.body.credential : null;
  if (!credential) {
    return res.status(400).json({ error: "Missing Google credential." });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res
      .status(500)
      .json({ error: "GOOGLE_CLIENT_ID is not configured on the server." });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: "Invalid Google token." });
    }

    const allowedDomain = (process.env.AUTH_ALLOWED_GOOGLE_DOMAIN || "")
      .trim()
      .toLowerCase();
    const allowedEmails = (process.env.AUTH_ALLOWED_GOOGLE_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const email = String(payload.email).toLowerCase();
    const emailDomain = email.includes("@") ? email.split("@")[1] : "";
    const domainAllowed = !allowedDomain || emailDomain === allowedDomain;
    const emailAllowed =
      allowedEmails.length === 0 || allowedEmails.includes(email);

    if (!domainAllowed || !emailAllowed) {
      return res.status(403).json({ error: "Account is not allowed." });
    }

    const user = {
      sub: payload.sub,
      email,
      name: payload.name || "",
      picture: payload.picture || "",
    };
    const token = createSessionToken(user);
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ success: true, user });
  } catch (error) {
    return res.status(401).json({ error: error.message || "Unauthorized" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("session", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ success: true });
});

app.use("/webhook", webflowWebhookRouter);

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/leads", requireAuth, async (req, res) => {
  try {
    const leads = await getLeads();
    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads/:id/forward", requireAuth, async (req, res) => {
  const lead = await getLeadById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found." });
  }

  try {
    const result = await sendLeadEmail(lead);
    if (result.skipped) {
      return res.status(400).json({ error: result.reason });
    }

    const updatedLead = await updateLead(lead.id, {
      emailForwarded: true,
      emailForwardedAt: new Date().toISOString(),
      emailForwardError: null,
    });

    return res.json({ success: true, lead: updatedLead });
  } catch (error) {
    await updateLead(lead.id, { emailForwardError: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/leads/:id/suitecrm", requireAuth, async (req, res) => {
  const lead = await getLeadById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found." });
  }

  try {
    const suiteResponse = await pushLeadToSuiteCrm(lead);
    const updatedLead = await updateLead(lead.id, {
      suiteCrmSynced: true,
      suiteCrmSyncedAt: new Date().toISOString(),
      suiteCrmResponse: suiteResponse,
      suiteCrmError: null,
    });

    return res.json({
      success: true,
      lead: updatedLead,
      suitecrm: suiteResponse,
    });
  } catch (error) {
    await updateLead(lead.id, { suiteCrmError: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/leads/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await deleteLead(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Lead not found." });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/config", requireAuth, (req, res) => {
  res.json({
    autoForwardEnabled: parseBoolean(process.env.AUTO_FORWARD_ENABLED, true),
    forwardToEmail: Boolean(process.env.FORWARD_TO_EMAIL),
    suiteCrmConfigured: Boolean(process.env.SUITECRM_BASE_URL),
  });
});

async function start() {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

start();
