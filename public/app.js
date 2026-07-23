const tableBody = document.getElementById("leadTableBody");
const template = document.getElementById("leadRowTemplate");
const refreshButton = document.getElementById("refreshButton");

const totalLeadsNode = document.getElementById("totalLeads");
const forwardedCountNode = document.getElementById("forwardedCount");
const syncedCountNode = document.getElementById("syncedCount");
const serviceStateNode = document.getElementById("serviceState");

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function createBadge(text, variant) {
  return `<span class="badge ${variant}">${text}</span>`;
}

function renderStats(leads) {
  totalLeadsNode.textContent = String(leads.length);
  forwardedCountNode.textContent = String(
    leads.filter((lead) => lead.emailForwarded).length,
  );
  syncedCountNode.textContent = String(
    leads.filter((lead) => lead.suiteCrmSynced).length,
  );
}

function buildStatusCell(lead) {
  if (lead.emailForwarded) {
    return createBadge("Forwarded", "ok");
  }

  if (lead.emailForwardError) {
    return createBadge("Error", "danger");
  }

  return createBadge("Pending", "warn");
}

function buildSuiteCell(lead) {
  if (lead.suiteCrmSynced) {
    return createBadge("Synced", "ok");
  }

  if (lead.suiteCrmError) {
    return createBadge("Error", "danger");
  }

  return createBadge("Not synced", "warn");
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : defaultText;
}

async function callAction(url, button, loadingText, defaultText) {
  setButtonLoading(button, true, loadingText, defaultText);
  try {
    const response = await fetch(url, { method: "POST" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || "Request failed");
    }
  } catch (error) {
    alert(error.message);
  } finally {
    setButtonLoading(button, false, loadingText, defaultText);
    await loadLeads();
  }
}

function makeActionButtons(lead) {
  const wrapper = document.createElement("div");
  wrapper.className = "actions";

  const emailBtn = document.createElement("button");
  emailBtn.className = "btn btn-secondary";
  emailBtn.textContent = "Forward Email";
  emailBtn.disabled = Boolean(lead.emailForwarded);
  emailBtn.addEventListener("click", () => {
    callAction(
      `/api/leads/${lead.id}/forward`,
      emailBtn,
      "Forwarding...",
      "Forward Email",
    );
  });

  const suiteBtn = document.createElement("button");
  suiteBtn.className = "btn btn-primary";
  suiteBtn.textContent = "Add to SuiteCRM";
  suiteBtn.disabled = Boolean(lead.suiteCrmSynced);
  suiteBtn.addEventListener("click", () => {
    callAction(
      `/api/leads/${lead.id}/suitecrm`,
      suiteBtn,
      "Syncing...",
      "Add to SuiteCRM",
    );
  });

  wrapper.append(emailBtn, suiteBtn);
  return wrapper;
}

function renderLeadRows(leads) {
  tableBody.innerHTML = "";

  if (!leads.length) {
    tableBody.innerHTML =
      '<tr><td colspan="8" class="empty">No leads yet</td></tr>';
    return;
  }

  for (const lead of leads) {
    const row = template.content.firstElementChild.cloneNode(true);

    row.querySelector(".date").textContent = formatDate(lead.createdAt);
    row.querySelector(".name").textContent = lead.name || "-";
    row.querySelector(".email").textContent = lead.email || "-";
    row.querySelector(".phone").textContent = lead.phone || "-";
    row.querySelector(".message").textContent = lead.message || "-";
    row.querySelector(".email-status").innerHTML = buildStatusCell(lead);
    row.querySelector(".suite-status").innerHTML = buildSuiteCell(lead);

    const actionCell = row.querySelector(".actions");
    actionCell.replaceWith(makeActionButtons(lead));

    tableBody.appendChild(row);
  }
}

async function loadServiceConfig() {
  try {
    const response = await fetch("/api/config");
    const json = await response.json();
    if (!response.ok) {
      throw new Error("Unable to load config");
    }

    const parts = [
      `AutoForward: ${json.autoForwardEnabled ? "ON" : "OFF"}`,
      `Target Email: ${json.forwardToEmail ? "SET" : "MISSING"}`,
      `SuiteCRM: ${json.suiteCrmConfigured ? "READY" : "MISSING URL"}`,
    ];
    serviceStateNode.textContent = parts.join(" | ");
  } catch {
    serviceStateNode.textContent = "Unable to read service status";
  }
}

async function loadLeads() {
  const response = await fetch("/api/leads");
  const json = await response.json();

  if (!response.ok) {
    throw new Error("Failed to load leads");
  }

  const leads = json.leads || [];
  renderStats(leads);
  renderLeadRows(leads);
}

refreshButton.addEventListener("click", () => {
  loadLeads().catch((error) => alert(error.message));
});

Promise.all([loadServiceConfig(), loadLeads()]).catch((error) => {
  alert(error.message);
});

setInterval(() => {
  loadLeads().catch(() => {});
}, 15000);
