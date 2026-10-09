(() => {
  const storageKey = "neelam_dandiya_leads_v1";
  let syncInProgress = false;

  function getLocalLeads() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalLeads(leads) {
    localStorage.setItem(storageKey, JSON.stringify(leads));
  }

  function markLeadPending(id) {
    const leads = getLocalLeads();
    const lead = leads.find((entry) => entry.id === id);
    if (!lead) return;
    lead.serverSync = "pending";
    saveLocalLeads(leads);
  }

  window.syncPending = async function () {
    if (
      !navigator.onLine ||
      window.location?.protocol === "file:" ||
      syncInProgress
    )
      return;
    syncInProgress = true;

    try {
      const leads = getLocalLeads();
      for (const lead of leads) {
        const saveToSQLite = lead.serverSync !== "synced";
        const saveToGoogle =
          CONFIG.GOOGLE_SCRIPT_URL && lead.googleSync !== "synced";
        if (!saveToSQLite && !saveToGoogle) continue;

        try {
          if (saveToSQLite) {
            const response = await fetch(
              `/api/leads/${encodeURIComponent(lead.id)}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(lead),
              },
            );
            if (!response.ok) break;

            lead.serverSync = "synced";
            saveLocalLeads(leads);
          }

          if (saveToGoogle) {
            const response = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify(lead),
            });
            if (!response.ok) break;

            lead.googleSync = "synced";
            saveLocalLeads(leads);
          }
        } catch {
          break;
        }
      }
    } finally {
      syncInProgress = false;
      window.renderAdmin?.();
    }
  };

  const updateLead = window.updateLead;
  window.updateLead = function (patch) {
    updateLead(patch);
    markLeadPending(state.lead.id);
    void window.syncPending();
  };

  document.getElementById("registrationForm").addEventListener("submit", () => {
    window.setTimeout(() => void window.syncPending(), 0);
  });
  window.addEventListener("online", () => void window.syncPending());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void window.syncPending();
  });

  window.renderAdmin = function () {
    const queueCount = document.getElementById("queueCount");
    const playedCount = document.getElementById("playedCount");
    if (queueCount) {
      queueCount.textContent = getLocalLeads().filter(
        (lead) => lead.serverSync !== "synced",
      ).length;
    }
    if (playedCount) {
      playedCount.textContent = getStats().played;
    }
  };

  void window.syncPending();
})();
