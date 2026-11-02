const escape = (value = "") => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const statuses = { proposed: "Needs review", planned: "Planned", active: "In progress", review: "In review", blocked: "Blocked", done: "Done", rejected: "Rejected" };
const drafts = new Map();

export async function mountTickets(host, context) {
  const { api, teamId, projectId, features, sessions, isCurrent, readOnly } = context;
  const endpoint = `/api/teams/${encodeURIComponent(teamId)}/projects/${encodeURIComponent(projectId)}/tickets`;
  const draftKey = [teamId, projectId, context.userId].join(":");
  let tickets = [], members = [], editing = null, filter = "all", query = "";
  const current = () => host.isConnected && isCurrent();
  host.innerHTML = '<div class="collaboration-page" role="status">Loading tickets…</div>';
  const name = id => members.find(member => member.userId === id)?.name || "Unassigned";
  async function load() {
    const [result, team] = await Promise.all([api(endpoint), api(`/api/teams/${encodeURIComponent(teamId)}/members`)]);
    if (!current()) return;
    tickets = result.tickets; members = team.members; render();
  }
  const selectOptions = (values, selected) => values.map(([id, label]) => `<option value="${escape(id)}" ${String(selected ?? "") === String(id) ? "selected" : ""}>${escape(label)}</option>`).join("");
  function render() {
    if (!current()) return;
    const active = editing ? tickets.find(row => row.id === editing) : null;
    const values = active?.payload || drafts.get(draftKey) || {};
    host.innerHTML = `<div class="collaboration-page"><div class="collaboration-intro"><h2>Plan the next piece of work</h2><p>Tickets describe intentions. Sessions record what actually happened. AI suggestions wait for your decision.</p></div><div class="ticket-toolbar"><label>Find a ticket<input type="search" name="ticketSearch" value="${escape(query)}" placeholder="Search title, context, or owner"/></label><label>Status<select name="ticketFilter">${selectOptions([["all", "All tickets"], ...Object.entries(statuses)], filter)}</select></label></div><div class="ticket-list"></div>${!readOnly ? `<details class="ticket-editor" ${editing ? "open" : ""}><summary>${editing ? "Edit ticket" : "Create a ticket"}</summary><form class="form ticket-form"><h3>${editing ? "Edit the plan" : "New ticket"}</h3><label>Ticket title<input name="title" minlength="3" maxlength="200" value="${escape(values.title)}" required/></label><label>Context<textarea name="description" rows="3" maxlength="4000">${escape(values.description)}</textarea></label><div class="form-grid"><label>Assignee<select name="assigneeId">${selectOptions([["", "Unassigned"], ...members.map(member => [member.userId, member.name])], values.assigneeId)}</select></label><label>Priority<select name="priority">${selectOptions(["low", "normal", "high", "urgent"].map(value => [value, value[0].toUpperCase() + value.slice(1)]), values.priority || "normal")}</select></label><label>Status<select name="status">${selectOptions(Object.entries(statuses).filter(([id]) => !["proposed", "rejected"].includes(id)), values.status || "planned")}</select></label><label>Due date<input name="dueDate" type="date" value="${escape(values.dueDate)}"/></label></div><label>Related feature<select name="featureId">${selectOptions([["", "No linked feature"], ...features.filter(feature => !feature.archivedAt).map(feature => [feature.id, feature.title])], values.featureId)}</select></label><label>Related session<select name="sessionId">${selectOptions([["", "No linked session"], ...sessions.map(session => [session.id, `${session.participant}: ${session.intent || session.sync?.summary?.slice(0,70) || "Building session"}`])], values.sessionId)}</select></label><p class="form-error" role="alert"></p><div class="form-actions">${editing ? '<button class="button" type="button" data-cancel-ticket>Cancel editing</button>' : ""}<button class="button primary" type="submit">${editing ? "Save ticket" : "Create ticket"}</button></div></form></details>` : '<p class="subtle">This project is archived. Tickets are read-only.</p>'}<p class="collaboration-status" role="status"></p></div>`;
    renderList();
    host.querySelector('[name="ticketSearch"]').addEventListener("input", event => { query = event.target.value; renderList(); });
    host.querySelector('[name="ticketFilter"]').addEventListener("change", event => { filter = event.target.value; renderList(); });
    const form = host.querySelector(".ticket-form");
    form?.addEventListener("input", () => { if (!editing) drafts.set(draftKey, Object.fromEntries(new FormData(form))); });
    form?.addEventListener("submit", async event => {
      event.preventDefault(); const button = form.querySelector('[type="submit"]'); if (button.disabled) return; button.disabled = true;
      const fields = Object.fromEntries(new FormData(form));
      for (const field of ["assigneeId", "featureId", "sessionId"]) fields[field] ||= null;
      if (active) { fields.sourceKind = active.payload.sourceKind; fields.sourceId = active.payload.sourceId; }
      try {
        await api(endpoint + (active ? "/" + encodeURIComponent(active.id) : ""), { method: active ? "PATCH" : "POST", body: JSON.stringify(active ? { action: "update", expectedVersion: active.version, fields } : fields) });
        editing = null; drafts.delete(draftKey); await load();
        if (current()) host.querySelector(".collaboration-status").textContent = "Ticket saved.";
      } catch (error) { form.querySelector(".form-error").textContent = error.message; button.disabled = false; }
    });
    host.querySelector("[data-cancel-ticket]")?.addEventListener("click", () => { editing = null; render(); });
  }
  function renderList() {
    const list = host.querySelector(".ticket-list"); if (!list) return;
    const shown = tickets.filter(row => (filter === "all" || row.payload.status === filter) && (!query || [row.payload.title, row.payload.description, name(row.payload.assigneeId)].join(" ").toLowerCase().includes(query.toLowerCase())));
    list.innerHTML = shown.map(row => `<article class="ticket-row"><div class="ticket-row-heading"><h3>${escape(row.payload.title)}</h3><span class="tag">${escape(statuses[row.payload.status] || row.payload.status)}</span></div><p class="learning-text">${escape(row.payload.description)}</p><p class="subtle">${escape(name(row.payload.assigneeId))} · ${escape(row.payload.priority)} priority${row.payload.dueDate ? " · Due " + escape(row.payload.dueDate) : ""}</p>${row.payload.sourceKind !== "manual" ? `<p class="subtle">Suggested from a ${escape(row.payload.sourceKind)}. The proposal is not a record of completed work.</p>` : ""}${row.payload.featureId ? `<p>Related feature: ${escape(features.find(feature => feature.id === row.payload.featureId)?.title || "Feature")}</p>` : ""}${!readOnly && row.payload.status === "proposed" ? `<div class="ticket-proposal-review"><p>Suggested assignee: ${escape(name(row.payload.suggestedAssigneeId))}. Nothing is assigned until you approve.</p><label>Assign on approval<select data-approve-assignee="${escape(row.id)}">${selectOptions([["", "Unassigned"], ...members.map(member => [member.userId, member.name])], row.payload.suggestedAssigneeId)}</select></label><button type="button" class="button primary" data-ticket-action="approve" data-ticket-id="${escape(row.id)}">Approve ticket</button><button type="button" class="button" data-ticket-action="reject" data-ticket-id="${escape(row.id)}">Reject suggestion</button></div>` : !readOnly && row.payload.status !== "rejected" ? `<button class="button compact" type="button" data-edit-ticket="${escape(row.id)}">Edit ticket</button>` : ""}</article>`).join("") || '<p class="subtle">No tickets match. Create a ticket or ask your agent to propose next tasks after a session.</p>';
    list.querySelectorAll("[data-edit-ticket]").forEach(button => button.addEventListener("click", () => { editing = button.dataset.editTicket; render(); host.querySelector('.ticket-form input[name="title"]').focus(); }));
    list.querySelectorAll("[data-ticket-action]").forEach(button => button.addEventListener("click", async () => {
      const row = tickets.find(row => row.id === button.dataset.ticketId); button.disabled = true;
      const selector = [...list.querySelectorAll("[data-approve-assignee]")].find(select => select.dataset.approveAssignee === row.id);
      try {
        await api(endpoint + "/" + encodeURIComponent(row.id), { method: "PATCH", body: JSON.stringify({ action: button.dataset.ticketAction, expectedVersion: row.version, fields: { ...row.payload, status: "planned", assigneeId: selector.value || null } }) });
        await load();
      } catch (error) { button.disabled = false; host.querySelector(".collaboration-status").textContent = error.message; }
    }));
  }
  try { await load(); }
  catch (error) { if (current()) { host.innerHTML = '<div class="collaboration-page"><p class="form-error" role="alert"></p><button class="button" type="button">Retry tickets</button></div>'; host.querySelector("p").textContent = error.message; host.querySelector("button").addEventListener("click", () => mountTickets(host, context)); } }
}
