export async function getLeads() {
  const response = await fetch("/api/leads");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load leads");
  }

  return data.leads || [];
}

export async function forwardLeadEmail(id) {
  const response = await fetch(`/api/leads/${id}/forward`, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to forward email");
  }

  return data;
}

export async function syncLeadToSuiteCrm(id) {
  const response = await fetch(`/api/leads/${id}/suitecrm`, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to sync to SuiteCRM");
  }

  return data;
}

export async function getConfigStatus() {
  const response = await fetch("/api/config");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load config");
  }

  return data;
}
