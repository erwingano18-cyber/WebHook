async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

export async function getGoogleConfig() {
  return apiFetch("/api/auth/google/config", {
    headers: {},
  });
}

export async function getCurrentUser() {
  return apiFetch("/api/auth/me", {
    headers: {},
  });
}

export async function loginWithGoogle(credential) {
  return apiFetch("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function logout() {
  return apiFetch("/api/auth/logout", {
    method: "POST",
  });
}

export async function getLeads() {
  const data = await apiFetch("/api/leads", { headers: {} });

  return data.leads || [];
}

export async function forwardLeadEmail(id) {
  return apiFetch(`/api/leads/${id}/forward`, { method: "POST" });
}

export async function syncLeadToSuiteCrm(id) {
  return apiFetch(`/api/leads/${id}/suitecrm`, { method: "POST" });
}

export async function removeLead(id) {
  return apiFetch(`/api/leads/${id}`, { method: "DELETE" });
}

export async function getConfigStatus() {
  return apiFetch("/api/config", { headers: {} });
}
