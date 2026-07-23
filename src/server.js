require("dotenv").config();

const cors = require("cors");
const express = require("express");

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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  }),
);

app.use("/webhook", webflowWebhookRouter);

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/leads", async (req, res) => {
  try {
    const leads = await getLeads();
    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads/:id/forward", async (req, res) => {
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

app.post("/api/leads/:id/suitecrm", async (req, res) => {
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

app.delete("/api/leads/:id", async (req, res) => {
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

app.get("/api/config", (req, res) => {
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
