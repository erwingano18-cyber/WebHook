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

function closeAllMenus() {
  document.querySelectorAll(".actions-menu.open").forEach((menu) => {
    menu.classList.remove("open");
  });
}

function openMenuAtButton(button, menu) {
  closeAllMenus();
  menu.classList.add("open");

  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  let top = buttonRect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = Math.max(8, buttonRect.top - menuRect.height - 6);
  }

  let left = buttonRect.right - menuRect.width;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

async function callAction(
  url,
  button,
  loadingText,
  defaultText,
  method = "POST",
) {
  setButtonLoading(button, true, loadingText, defaultText);
  try {
    const response = await fetch(url, { method });
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
  wrapper.className = "actions actions-menu-wrap";

  const menuBtn = document.createElement("button");
  menuBtn.className = "btn btn-secondary btn-kebab";
  menuBtn.type = "button";
  menuBtn.textContent = "...";
  menuBtn.setAttribute("aria-label", "Open lead actions");

  const menu = document.createElement("div");
  menu.className = "actions-menu";

  const forwardBtn = document.createElement("button");
  forwardBtn.className = "actions-item";
  forwardBtn.type = "button";
  forwardBtn.textContent = "Forward Email";
  forwardBtn.disabled = Boolean(lead.emailForwarded);
  forwardBtn.addEventListener("click", () => {
    menu.classList.remove("open");
    callAction(
      `/api/leads/${lead.id}/forward`,
      forwardBtn,
      "Forwarding...",
      "Forward Email",
    );
  });

  const suiteBtn = document.createElement("button");
  suiteBtn.className = "actions-item";
  suiteBtn.type = "button";
  suiteBtn.textContent = "Add to SuiteCRM";
  suiteBtn.disabled = Boolean(lead.suiteCrmSynced);
  suiteBtn.addEventListener("click", () => {
    menu.classList.remove("open");
    callAction(
      `/api/leads/${lead.id}/suitecrm`,
      suiteBtn,
      "Syncing...",
      "Add to SuiteCRM",
    );
  });

  const payloadBtn = document.createElement("button");
  payloadBtn.className = "actions-item";
  payloadBtn.type = "button";
  payloadBtn.textContent = "View Payload";
  payloadBtn.addEventListener("click", () => {
    menu.classList.remove("open");
    alert(JSON.stringify(lead.rawPayload || {}, null, 2));
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "actions-item danger";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete / Remove";
  deleteBtn.addEventListener("click", () => {
    const ok = window.confirm("Remove this lead permanently?");
    if (!ok) {
      menu.classList.remove("open");
      return;
    }
    menu.classList.remove("open");
    callAction(
      `/api/leads/${lead.id}`,
      deleteBtn,
      "Removing...",
      "Delete / Remove",
      "DELETE",
    );
  });

  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menu.classList.contains("open")) {
      menu.classList.remove("open");
      return;
    }

    openMenuAtButton(menuBtn, menu);
  });

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  menu.append(forwardBtn, suiteBtn, payloadBtn, deleteBtn);
  wrapper.append(menuBtn, menu);
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

document.addEventListener("click", () => {
  closeAllMenus();
});

setInterval(() => {
  loadLeads().catch(() => {});
}, 15000);
