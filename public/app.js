import { sampleWorkspace } from "./demo.js";
import { repositoryPresentation } from "./repository-ui.js";
import { buildProjectMap, sessionBranch } from "./project-map.js";
import { hydrateIcons, icon } from "./icons.js";
import { initializeLanding } from "./landing.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
const e = escapeHtml;
const statuses = { planned: "Planned", active: "In progress", review: "In review", blocked: "Blocked", done: "Done" };
const sessionStatuses = { choosing: "Choosing work", active: "In progress", synced: "Synced" };
const mcpUrl = location.origin + "/mcp";
let data = { user: null, teams: [], projects: [], features: [], sessions: [] };
let members = [];
let demo = false;
let authMode = "login";
let view = "map";
let mapGrouping = "features";
const collapsedMapNodes = new Set();
let teamId = localStorage.getItem("collavibe-team") || "";
let projectId = localStorage.getItem("collavibe-project") || "";
let selection = null;
let editingFeature = null;
let editingProject = null;
const commentDrafts = new Map();
let postingComment = "";
const priorities = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
const dueLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value + "T12:00:00")) : "Not set";
const isOverdue = (item) => item.dueDate && item.status !== "done" && item.dueDate < new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");
let requestSequence = 0;
let busyLoad = false;
let fingerprint = "";
let toastTimer;
let memberError = "";
let issuedKey = "";
let connections = [];
let authorizationId = new URLSearchParams(location.search).get("authorize") || "";
let invitation = new URLSearchParams(location.search).get("join") || "";
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get("team")) teamId = hash.get("team");
if (hash.get("project")) projectId = hash.get("project");
if (["map", "work", "sessions", "repository", "team"].includes(hash.get("view"))) view = hash.get("view");
if (hash.get("feature")) selection = { kind: "feature", id: hash.get("feature") };
if (hash.get("session")) { selection = { kind: "session", id: hash.get("session") }; if (view !== "map") view = "sessions"; }

const currentProject = () => data.projects.find((item) => item.id === projectId);
const currentFeatures = () => data.features.filter((item) => item.projectId === projectId);
const currentSessions = () => data.sessions.filter((item) => item.projectId === projectId);
const initial = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "Not yet";
const dot = (status) => `<span class="status-dot ${e(status)}" aria-hidden="true"></span>`;
const tag = (status) => `<span class="tag">${dot(status)}${e(statuses[status] || sessionStatuses[status] || status)}</span>`;
function setMobileNav(open) {
  $("workspace").classList.toggle("mobile-nav", open);
  document.body.classList.toggle("navigation-open", open);
  document.querySelector(".main").inert = open && matchMedia("(max-width: 700px)").matches;
  $("mobile-projects").setAttribute("aria-expanded", String(open));
  if (open) $("close-navigation").focus();
}
function showGate(which) {
  if (which !== "workspace") setMobileNav(false);
  $("initial-loading").hidden = true;
  $("auth-gate").hidden = which !== "auth";
  $("team-gate").hidden = which !== "team";
  $("workspace").hidden = which !== "workspace";
  $("consent-gate").hidden = which !== "consent";
  if (which === "auth" && (authorizationId || invitation)) {
    $("account").scrollIntoView({ block: "start" });
  }
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").className = "toast" + (error ? " error" : "");
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, error ? 7000 : 3000);
}
async function copy(value) {
  try { await navigator.clipboard.writeText(value); }
  catch {
    const area = document.createElement("textarea");
    area.value = value; area.style.position = "fixed"; area.style.opacity = "0";
    // A modal makes elements outside it inert.
    (document.querySelector("dialog[open]") || document.body).append(area);
    area.select();
    const ok = document.execCommand("copy"); area.remove();
    if (!ok) throw new Error("Copy failed. Please select and copy the text manually.");
  }
  toast("Copied to clipboard.");
}
async function api(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(15000), ...options, headers: { "content-type": "application/json", ...options.headers } });
  const result = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result?.error || "The request failed. Try again."); error.status = response.status; throw error; }
  return result;
}
async function formAction(form, action) {
  if (form.dataset.busy) return;
  form.dataset.busy = "true";
  const button = form.querySelector('[type="submit"]');
  const error = form.querySelector(".form-error");
  const previous = button?.textContent;
  if (error) error.textContent = "";
  if (button) { button.disabled = true; button.textContent = "Saving…"; }
  try { await action(); }
  catch (caught) { if (error) error.textContent = caught.name === "TimeoutError" ? "The request timed out. Try again." : caught.message; else toast(caught.message, true); }
  finally { delete form.dataset.busy; if (button) { button.disabled = false; button.textContent = previous; } }
}
function canWrite() { if (demo) { toast("This is a sample workspace. Log in to make changes."); return false; } return true; }
async function load({ quiet = false } = {}) {
  if (demo || (quiet && busyLoad)) return;
  const sequence = ++requestSequence;
  busyLoad = true;
  if (!quiet) $("refresh").disabled = true;
  try {
    if (!data.user) {
      const auth = await api("/api/auth/status");
      if (sequence !== requestSequence || demo) return;
      if (!auth.authenticated) { showGate("auth"); return; }
    }
    const next = await api("/api/dashboard" + (teamId ? "?teamId=" + encodeURIComponent(teamId) : ""));
    if (sequence !== requestSequence || demo) return;
    data = next;
    if (!data.teams.length || invitation) {
      $("back-workspace").hidden = !data.teams.length;
      if (invitation) { setTeamMode("join"); $("join-team-form").elements.joinCode.value = invitation; }
      showGate("team"); return;
    }
    teamId = data.selectedTeam.id;
    localStorage.setItem("collavibe-team", teamId);
    if (!data.projects.some((item) => item.id === projectId)) {
      projectId = [...data.projects].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || b.updatedAt.localeCompare(a.updatedAt))[0]?.id || "";
      selection = null;
    }
    localStorage.setItem("collavibe-project", projectId);
    if (authorizationId) { await showConsent(); return; }
    showGate("workspace");
    $("load-error").hidden = true;
    $("connection-label").classList.remove("offline");
    $("connection-label").textContent = "Workspace updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const nextFingerprint = JSON.stringify(data);
    if (nextFingerprint !== fingerprint || !quiet) { fingerprint = nextFingerprint; render(); }
    if (view === "team" || !members.length) await loadMembers();
  } catch (error) {
    if (sequence !== requestSequence || demo) return;
    if (error.status === 401) {
      data = { user: null, teams: [], projects: [], features: [], sessions: [] }; fingerprint = ""; members = [];
      document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
      showGate("auth");
    } else {
      const message = error.name === "TimeoutError" ? "The server took too long to respond. Try Refresh." : error.message;
      if ($("workspace").hidden) { showGate("auth"); $("auth-error").textContent = message; }
      else { $("load-error").textContent = "Updates paused. " + message; $("load-error").hidden = false; $("connection-label").textContent = "Updates paused"; $("connection-label").classList.add("offline"); }
    }
  } finally { if (sequence === requestSequence) { busyLoad = false; $("refresh").disabled = false; } }
}
async function loadMembers() {
  if (demo) { members = data.members; return; }
  const expectedTeam = teamId;
  try {
    const result = await api("/api/teams/" + teamId + "/members");
    if (expectedTeam !== teamId || demo) return;
    members = result.members; memberError = "";
    $("member-names").innerHTML = members.map((item) => `<option value="${e(item.name)}"></option>`).join("");
    if (view === "team") renderTeam();
  } catch (error) {
    if (expectedTeam !== teamId) return;
    memberError = error.message;
    if (view === "team") renderTeam();
  }
}
function updateHash() {
  if (demo) return;
  const params = new URLSearchParams();
  if (teamId) params.set("team", teamId);
  if (projectId) params.set("project", projectId);
  params.set("view", view);
  if (selection) params.set(selection.kind, selection.id);
  history.replaceState(null, "", location.pathname + location.search + (params.size ? "#" + params : ""));
}
function render() {
  const project = currentProject();
  if (!["work", "map"].includes(view) && ["priority", "due"].includes($("sort").value)) $("sort").value = "updated";
  $("team-name").textContent = data.selectedTeam?.name || "Team";
  $("team-select").innerHTML = data.teams.map((item) => `<option value="${e(item.id)}" ${item.id === teamId ? "selected" : ""}>${e(item.name)}</option>`).join("");
  $("account-name").textContent = data.user?.name || "";
  $("account-email").textContent = demo ? "Sample account · read-only" : data.user?.email || "";
  $("account-name").title = data.user?.name || "";
  $("account-email").title = demo ? "You are viewing fictional sample data, not your account." : data.user?.email || "";
  $("account-avatar").textContent = initial(data.user?.name);
  $("logout-label").textContent = demo ? "Leave sample" : "Log out";
  const projectLink = (item) => `<button class="project-link ${item.id === projectId && view !== "team" ? "selected" : ""}" data-project="${e(item.id)}" title="${e(item.name)}" type="button"><span class="project-symbol" aria-hidden="true">${e(initial(item.name).slice(0,1))}</span><span>${e(item.name)}</span><small title="Open features">${data.features.filter((f) => f.projectId === item.id && f.status !== "done" && !f.archivedAt).length} open</small></button>`;
  $("project-list").innerHTML = data.projects.filter((item) => !item.archivedAt).map(projectLink).join("") || '<p class="subtle">No active projects.</p>';
  const archived = data.projects.filter((item) => item.archivedAt);
  $("archived-projects").hidden = !archived.length;
  $("archived-project-list").innerHTML = archived.map(projectLink).join("");
  if (project?.archivedAt) $("archived-projects").open = true;
  $("archive-banner").hidden = !project?.archivedAt;
  $("project-settings").hidden = !project || data.selectedTeam?.ownerUserId !== data.user?.id;
  $("project-settings").disabled = demo;
  $("project-name").textContent = view === "team" ? "Team" : project?.name || "Projects";
  const repo = repositoryPresentation(project, demo);
  $("repository-summary").hidden = !repo || view === "team";
  $("repo-link").href = repo?.url || "#";
  $("repo-link").setAttribute("aria-label", repo ? "Open " + repo.name + " on " + repo.provider + " (new tab)" : "Repository");
  $("repository-name").textContent = repo?.name || "";
  $("repository-label").textContent = repo ? repo.label + " · " + repo.provider : "";
  $("repository-description").textContent = repo?.description || "";
  $("repository-status").textContent = repo?.status || "";
  $("repository-snapshot").textContent = repo?.hasSnapshot ? [repo.branch, repo.capturedAt ? "Captured " + date(repo.capturedAt) : ""].filter(Boolean).join(" · ") : "";
  $("repository-snapshot").hidden = !repo?.hasSnapshot;
  $("copy-repository").disabled = !repo;
  $("demo-banner").hidden = !demo;
  $("project-workspace").hidden = view === "team";
  $("project-workspace").classList.toggle("map-view", view === "map");
  $("project-filters").hidden = !project;
  const mapFilters = view === "map";
  if ($("project-filters").classList.contains("collapsible") !== mapFilters) $("project-filters").open = !mapFilters;
  $("project-filters").classList.toggle("collapsible", mapFilters);
  $("team-content").hidden = view !== "team";
  document.querySelectorAll("[data-view]").forEach((button) => { if (button.dataset.view === view) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
  $("view-title").textContent = project ? ({ map: "Project map", work: "Work", sessions: "Sessions", repository: "Branches & files" })[view] || "Work" : "Projects";
  $("project-description").textContent = view === "map" && project ? "See who is building what, and where the next person can pick up." : view === "sessions" ? "What changed, what was decided, and where to continue." : view === "repository" ? "The latest repository snapshot shared by your coding agent." : project ? "Features and tasks for " + project.name + "." : "Add a repository to start planning with your team.";
  $("work-count").textContent = currentFeatures().filter((item) => !item.archivedAt).length;
  $("session-count").textContent = currentSessions().length;
  $("new-feature").hidden = !["work", "map"].includes(view) || !project;
  $("export-project").disabled = !project;
  $("export-project").hidden = !project;
  $("new-feature").disabled = demo || !!project?.archivedAt;
  $("work-options").hidden = !["work", "map"].includes(view) || !project;
  $("sidebar-add-project").disabled = demo;
  $("add-team").disabled = demo;
  $("project-tools").hidden = !project;
  document.querySelector(".view-tabs").hidden = !project;
  $("status-filter").hidden = !["work", "map"].includes(view);
  $("owner-filter").hidden = view === "repository";
  $("sort").hidden = view === "repository";
  for (const option of $("sort").options) if (["priority", "due"].includes(option.value)) option.hidden = !["work", "map"].includes(view);
  $("search").placeholder = view === "repository" ? "Search branches and files…" : "Search features, people, decisions…";
  const owner = $("owner-filter").value;
  const names = view === "map" ? buildProjectMap({ projectId, features: data.features, sessions: data.sessions }).people : [...new Set(view === "sessions" ? currentSessions().map((item) => item.participant) : currentFeatures().map((item) => item.owner).filter(Boolean))].sort();
  $("owner-filter").setAttribute("aria-label", view === "map" ? "Person" : "Owner");
  $("owner-filter").innerHTML = '<option value="all">' + (view === "map" ? "All people" : "Everyone") + '</option>' + (view === "sessions" ? "" : '<option value="unassigned">Unassigned</option>') + names.map((name) => `<option value="${e(name)}">${e(name)}</option>`).join("");
  $("owner-filter").value = names.includes(owner) || owner === "unassigned" ? owner : "all";
  if (view === "team") renderTeam(); else renderContent();
  updateHash();
}
function empty(title, message, actions = "") {
  return `<div class="empty-state"><span class="empty-index" aria-hidden="true">${icon("network")}</span><h2>${e(title)}</h2><p>${e(message)}</p>${actions ? '<div class="empty-actions">' + actions + "</div>" : ""}</div>`;
}
function selected(kind, id) { return selection?.kind === kind && selection.id === id; }
function compare(a, b) {
  if ($("sort").value === "priority") return ["urgent", "high", "normal", "low"].indexOf(a.priority || "normal") - ["urgent", "high", "normal", "low"].indexOf(b.priority || "normal") || a.title.localeCompare(b.title);
  if ($("sort").value === "due") return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || (a.title || "").localeCompare(b.title || "");
  if ($("sort").value === "title") {
    const name = (item) => item.title || data.features.find((feature) => feature.id === item.featureId)?.title || item.intent || item.participant || "";
    return name(a).localeCompare(name(b));
  }
  if ($("sort").value === "created") return (a.createdAt || a.startedAt).localeCompare(b.createdAt || b.startedAt);
  return (b.updatedAt || b.syncedAt || b.startedAt).localeCompare(a.updatedAt || a.syncedAt || a.startedAt);
}
function renderContent() {
  const project = currentProject();
  const query = $("search").value.trim().toLowerCase();
  const owner = $("owner-filter").value;
  const content = $("work-content");
  if (!project) {
    content.innerHTML = empty("Add your first project", "Enter your Git repository URL, then plan features or connect a coding agent to bring in the current work.", '<button type="button" class="button primary" data-action="add-project">+ Add project</button><button type="button" class="button" data-action="connect-agent">Connect agent</button>');
    $("detail-pane").hidden = true; return;
  }
  if (view === "repository") { renderRepository(project, query); $("detail-pane").hidden = true; return; }
  if (view === "map") { renderMap(project, query); renderDetail(); return; }
  if (view === "sessions") {
    const sessions = currentSessions().filter((item) => (owner === "all" || item.participant === owner) && (!query || JSON.stringify([item.participant, item.intent, item.sync, data.features.find((f) => f.id === item.featureId)?.title]).toLowerCase().includes(query))).sort(compare);
    content.innerHTML = sessions.length ? sessions.map((item) => {
      const feature = data.features.find((f) => f.id === item.featureId);
      return `<button type="button" class="work-row session-row ${selected("session", item.id) ? "selected" : ""}" data-session="${e(item.id)}"><span class="avatar" aria-hidden="true">${e(initial(item.participant))}</span><span class="work-main"><strong>${e(feature?.title || item.intent || "Session")}<span class="session-person">${e(item.participant)}</span></strong><p>${e(item.sync?.summary || "Session started. The agent has not synced a handoff yet.")}</p>${item.sync?.blockers?.length ? '<small class="mini-flag">' + item.sync.blockers.length + " blocker" + (item.sync.blockers.length === 1 ? "" : "s") + "</small>" : ""}</span><span class="work-meta"><span>${e(date(item.syncedAt || item.startedAt))}</span><span>${e(sessionStatuses[item.status])}</span><code>${e(sessionBranch(item) || "No branch")}</code></span></button>`;
    }).join("") + `<p class="count-summary">${sessions.length} of ${currentSessions().length} sessions</p>` : empty(currentSessions().length ? "No matching sessions" : "No sessions yet", currentSessions().length ? "Try a different search or owner." : "Connect your coding agent and start a session. The handoff will appear here after you ask it to sync.", '<button type="button" class="button" data-action="connect-agent">Connect agent</button>');
  } else {
    const scope = currentFeatures().filter((item) => Boolean(item.archivedAt) === $("show-archived").checked);
    const filtered = scope.filter((item) => ($("priority-filter").value === "all" || (item.priority || "normal") === $("priority-filter").value) && ($("status-filter").value === "all" || item.status === $("status-filter").value) && (owner === "all" || (owner === "unassigned" ? !item.owner : item.owner === owner)) && (!query || JSON.stringify([item.title, item.description, item.owner, item.branch, item.checklist, item.comments]).toLowerCase().includes(query))).sort(compare);
    content.innerHTML = filtered.length ? Object.entries(statuses).map(([status, label]) => {
      const features = filtered.filter((item) => item.status === status);
      if (!features.length) return "";
      return `<div class="work-group-heading">${dot(status)}${label}<small>${features.length}</small></div>` + features.map((item) => `<button type="button" class="work-row ${selected("feature", item.id) ? "selected" : ""}" data-feature="${e(item.id)}"><span class="work-main"><strong>${e(item.title)}</strong><small>${e(item.description || "No description")}</small><span class="feature-labels"><span class="priority ${e(item.priority || "normal")}">${e(priorities[item.priority || "normal"])}</span>${item.dueDate ? '<span class="' + (isOverdue(item) ? 'overdue' : '') + '">Due ' + e(dueLabel(item.dueDate)) + '</span>' : ''}${item.comments?.length ? '<span>' + item.comments.length + ' comments</span>' : ''}${item.archivedAt ? '<span>Archived</span>' : ''}</span></span><span class="work-meta"><code>${e(item.branch)}</code><span title="Checklist">${item.checklist.filter((check) => check.done).length}/${item.checklist.length}</span><span class="avatar" title="${e(item.owner || "Unassigned")}">${e(item.owner ? initial(item.owner) : "–")}</span></span></button>`).join("");
    }).join("") + `<p class="count-summary">${filtered.length} of ${scope.length} ${$("show-archived").checked ? "archived " : ""}features · ${scope.filter((item) => item.status === "done").length} done</p>` : empty(scope.length ? "No matching features" : $("show-archived").checked ? "Nothing archived" : "What needs to be built?", scope.length ? "Try a different search, priority, status, or owner." : $("show-archived").checked ? "Archived features will appear here. Their checklists, discussions, and session history are kept." : "Add a feature with a checklist. Your teammates and coding agents will see it when they start working.", $("show-archived").checked ? '<button type="button" class="button" data-action="show-active">Back to active features</button>' : '<button type="button" class="button primary" data-action="new-feature"' + (demo || project.archivedAt ? " disabled" : "") + '>+ New feature</button>');
  }
  renderDetail();
}
function mapSessionNode(session) {
  const commits = session.sync?.verified?.commits?.length || 0;
  const files = session.sync?.verified?.changedFiles?.length || 0;
  return `<li class="map-session-item"><button type="button" class="map-session ${selected("session", session.id) ? "selected" : ""}" data-session="${e(session.id)}"><span class="avatar" aria-hidden="true">${e(initial(session.participant))}</span><span class="map-session-copy"><span class="map-node-heading"><strong>${e(session.participant)}</strong><span class="tag">${e(sessionStatuses[session.status])}</span></span><span class="map-session-summary">${e(session.sync?.summary || session.intent || "Session started. No handoff saved yet.")}</span><span class="map-node-meta"><code>${e(sessionBranch(session) || "Branch not recorded")}</code><span>${commits} ${commits === 1 ? "commit" : "commits"} · ${files} ${files === 1 ? "file" : "files"}</span><span>${e(date(session.syncedAt || session.startedAt))}</span></span></span><span class="map-open-label">Open handoff ↗</span></button></li>`;
}
function mapFeatureNode(entry, group = "features", person = "") {
  const feature = entry.feature;
  const nodeKey = group + ":" + feature.id;
  const linked = person ? entry.sessions.filter((session) => session.participant.trim() === person) : entry.sessions;
  const done = feature.checklist?.filter((item) => item.done).length || 0;
  return `<li class="map-feature-item"><details class="map-feature ${selected("feature", feature.id) ? "selected" : ""}" data-map-node="${e(nodeKey)}" ${collapsedMapNodes.has(nodeKey) ? "" : "open"}><summary><span class="map-chevron" aria-hidden="true">›</span><span class="map-feature-heading"><span class="map-node-heading"><span class="tag">${dot(feature.status)}${e(statuses[feature.status] || feature.status)}</span>${feature.archivedAt ? '<span class="tag">Archived</span>' : ""}</span><strong>${e(feature.title)}</strong><span class="map-node-meta"><span>Owner: ${e(feature.owner || "Unassigned")}</span><span>${done}/${feature.checklist?.length || 0} checklist complete</span></span></span><span class="map-session-count">${linked.length} ${linked.length === 1 ? "session" : "sessions"}</span></summary><div class="map-feature-body"><div class="map-feature-context"><code>${e(feature.branch || "No branch assigned")}</code><button class="button compact" type="button" data-feature="${e(feature.id)}">Open feature & checklist</button></div>${linked.length ? '<ul class="map-session-list">' + linked.map(mapSessionNode).join("") + '</ul>' : '<p class="map-no-session">' + (person ? "No session recorded by this person yet." : "No sessions yet. Connect your agent to start work on this feature.") + '</p>'}</div></details></li>`;
}
function renderMap(project, query) {
  const filterCount = [query, $("owner-filter").value !== "all", $("status-filter").value !== "all", $("priority-filter").value !== "all", $("show-archived").checked].filter(Boolean).length;
  $("filter-summary").textContent = filterCount ? "· " + filterCount + " active" : "";
  const model = buildProjectMap({ projectId, features: data.features, sessions: data.sessions, query, person: $("owner-filter").value, status: $("status-filter").value, priority: $("priority-filter").value, archived: $("show-archived").checked });
  model.entries.sort((a, b) => compare(a.feature, b.feature));
  for (const group of model.groups) group.entries.sort((a, b) => compare(a.feature, b.feature));
  const summary = model.summary;
  const root = `<div class="map-root"><span class="map-root-icon" aria-hidden="true">${icon("git-branch")}</span><div><p class="map-eyebrow">${demo ? "Sample project" : "Project"}</p><h2>${e(project.name)}</h2></div><dl class="map-stats"><div><dt>Features</dt><dd>${summary.features}</dd></div><div><dt>People</dt><dd>${summary.people}</dd></div><div><dt>Saved handoffs</dt><dd>${summary.handoffs}</dd></div><div><dt>Recorded commits</dt><dd>${summary.commits}</dd></div></dl></div>`;
  const controls = `<div class="map-controls"><div class="map-grouping" role="group" aria-label="Group project map"><button class="button compact" type="button" data-map-group="features" aria-pressed="${mapGrouping === "features"}">By feature</button><button class="button compact" type="button" data-map-group="people" aria-pressed="${mapGrouping === "people"}">By contributor</button></div><div class="map-expansion"><button class="text-button" type="button" data-map-expand="all">Expand all</button><button class="text-button" type="button" data-map-expand="none">Collapse all</button></div></div>`;
  let branches = "";
  if (mapGrouping === "features") branches = model.entries.map((entry) => mapFeatureNode(entry)).join("");
  else branches = model.groups.map((group) => {
    const key = "person:" + group.name;
    const assigned = group.unassigned ? group.entries.length : group.entries.filter((entry) => entry.feature.owner?.trim() === group.name).length;
    return `<li class="map-person-item"><details class="map-person" data-map-node="${e(key)}" ${collapsedMapNodes.has(key) ? "" : "open"}><summary><span class="map-chevron" aria-hidden="true">›</span><span class="avatar" aria-hidden="true">${e(initial(group.name))}</span><span><strong>${e(group.name)}</strong><span class="map-node-meta">${group.sessions.length} recorded ${group.sessions.length === 1 ? "session" : "sessions"} · ${assigned} ${group.unassigned ? "unassigned" : "assigned"} ${assigned === 1 ? "feature" : "features"}</span></span></summary><ul class="map-branches">${group.entries.map((entry) => mapFeatureNode(entry, "person-" + group.name, group.unassigned ? "" : group.name)).join("")}${model.unlinkedSessions.filter((session) => session.participant.trim() === group.name).map(mapSessionNode).join("")}</ul></details></li>`;
  }).join("");
  if (mapGrouping === "features" && model.unlinkedSessions.length) branches += `<li class="map-unlinked"><h3>Sessions without a feature</h3><p class="subtle">Started sessions that have not been linked to a feature.</p><ul class="map-session-list">${model.unlinkedSessions.map(mapSessionNode).join("")}</ul></li>`;
  const blank = !summary.features && !summary.sessions;
  $("work-content").innerHTML = `<div class="project-map">${root}${controls}<p class="map-help">${mapGrouping === "features" ? "Project → features → people’s sessions. Open a feature for its checklist, or a session for the handoff." : "Project → people → their assigned features and recorded sessions. Assignment alone does not mean work has been completed."}</p>${branches ? '<ul class="map-branches map-trunk" aria-label="Project relationships">' + branches + '</ul>' : empty(blank ? "Your project map starts here" : "No matching work", blank ? "Add a feature, then connect an agent. Each session will appear under the feature and person who worked on it." : "Try changing the search, person, status, or archive filters.", blank ? '<button class="button primary" type="button" data-action="new-feature"' + (demo || project.archivedAt ? ' disabled' : '') + '>+ New feature</button><button class="button" type="button" data-action="connect-agent">Connect agent</button>' : '<button class="button" type="button" data-action="reset-map-filters">Clear filters</button>')}<p class="map-footnote">${model.entries.length} shown · People are assigned owners or recorded participants, not every team member. Connections show recorded work relationships, not Git merges.</p></div>`;
}
function renderRepository(project, query) {
  const git = project.latestGit || {};
  const files = (git.trackedFiles || []).filter((file) => !query || file.toLowerCase().includes(query));
  const branches = (git.branches || []).filter((branch) => !query || branch.name.toLowerCase().includes(query));
  if (!git.head) {
    $("work-content").innerHTML = empty("Repository linked. No snapshot yet.", "The link above opens your repository. To see branches and files here, connect your coding agent, open that repository, and send the Start session prompt.", '<button class="button" data-action="connect-agent" type="button">Connect agent</button>'); return;
  }
  $("work-content").innerHTML = `<div class="repo-content"><p class="subtle">Last snapshot: ${e(date(git.capturedAt))}. Supplied by the coding agent.</p><section class="team-section"><h2>Branches <span class="subtle">${branches.length}</span></h2>${branches.map((branch) => `<div class="branch-row"><code>${e(branch.name)} ${branch.current ? '<small>current</small>' : ""}</code><code>${e(branch.head.slice(0,7))}</code></div>`).join("") || '<p class="subtle">No matching branches.</p>'}</section><section class="team-section"><h2>Tracked files <span class="subtle">${files.length}</span></h2><ul class="repo-files">${files.map((file) => "<li>" + e(file) + "</li>").join("") || '<li>No matching files.</li>'}</ul></section></div>`;
}
function detailSection(title, items) {
  if (!items?.length) return "";
  return `<section class="detail-section"><h3>${e(title)}</h3><ul>${items.map((item) => "<li>" + e(item) + "</li>").join("")}</ul></section>`;
}
function evidence(sync) {
  const verified = sync?.verified;
  if (!verified) return "";
  const local = verified.source === "local_git";
  return `<section class="detail-section"><h3>Repository changes</h3><p>${local ? "Read from local Git." : "Reported by the coding agent; not independently checked by Collavibe."}</p><p><code>${e(verified.startHead.slice(0,7))} → ${e(verified.endHead.slice(0,7))}</code></p>${verified.commits.length ? '<ul class="commit-list">' + verified.commits.map((commit) => `<li><code>${e(commit.shortHash)}</code><span>${e(commit.subject)}</span><small>${e(commit.author)}</small></li>`).join("") + "</ul>" : ""}</section>${verified.changedFiles.length ? '<section class="detail-section"><h3>Changed files</h3><ul class="file-list">' + verified.changedFiles.map((file) => "<li>" + e(file) + "</li>").join("") + "</ul></section>" : ""}`;
}
function sessionBranchProperties(item) {
  const finalBranch = sessionBranch(item);
  const changed = item.sync && item.startSnapshot?.branch && item.startSnapshot.branch !== finalBranch;
  return `<dt>${item.sync ? "Final branch" : "Starting branch"}</dt><dd><code>${e(finalBranch || "Not set")}</code></dd>${changed ? '<dt>Started on</dt><dd><code>' + e(item.startSnapshot.branch) + '</code></dd>' : ''}`;
}
function renderDetail() {
  if (postingComment && selection?.id === postingComment) return;
  const commentFocus = document.activeElement?.id === "comment-text" ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  const item = selection && (selection.kind === "feature" ? currentFeatures() : currentSessions()).find((candidate) => candidate.id === selection.id);
  $("detail-pane").hidden = !item;
  if (!item) return;
  const isFeature = selection.kind === "feature";
  $("detail-kind").textContent = isFeature ? "Feature" : "Session";
  if (isFeature) {
    const sessions = currentSessions().filter((session) => session.featureId === item.id).sort(compare);
    const completed = item.checklist.filter((check) => check.done).length;
    $("detail").innerHTML = `<h2 class="detail-title">${e(item.title)}</h2><p class="detail-description">${e(item.description || "No description yet.")}</p><div class="detail-actions"><button type="button" class="button compact" data-action="edit-feature" ${demo ? "disabled" : ""}>Edit feature</button><button type="button" class="button compact" data-action="copy-feature">Copy agent prompt</button></div><dl class="properties"><dt>Status</dt><dd>${tag(item.status)}</dd><dt>Owner</dt><dd>${e(item.owner || "Unassigned")}</dd><dt>Branch</dt><dd><code>${e(item.branch || "Not set")}</code></dd><dt>Updated</dt><dd>${e(date(item.updatedAt))}</dd></dl><section class="detail-section"><h3>Checklist <span class="subtle">${completed}/${item.checklist.length}</span></h3><div class="progress" role="progressbar" aria-label="Checklist progress" aria-valuemin="0" aria-valuemax="${item.checklist.length || 1}" aria-valuenow="${completed}"><span style="width:${item.checklist.length ? 100 * completed / item.checklist.length : 0}%"></span></div><div class="checklist">${item.checklist.map((check) => `<label class="${check.done ? "done" : ""}"><input type="checkbox" data-check="${e(check.id)}" ${check.done ? "checked" : ""} ${demo ? "disabled" : ""}/><span>${e(check.text)}</span></label>`).join("") || '<p class="subtle">Add checklist items from Edit feature.</p>'}</div></section>${sessions.length ? '<section class="detail-section"><h3>Sessions for this feature</h3>' + sessions.map((session) => `<p><button class="text-button" type="button" data-session="${e(session.id)}">${e(session.participant)} · ${e(date(session.startedAt))}</button></p>`).join("") + "</section>" : ""}`;
  } else {
    const feature = data.features.find((f) => f.id === item.featureId);
    $("detail").innerHTML = `<h2 class="detail-title">${e(feature?.title || item.intent || "Session")}</h2><p class="detail-description">${e(item.sync?.summary || "The session has not been synced yet.")}</p><div class="detail-actions"><button type="button" class="button compact" data-action="copy-handoff">Copy handoff</button><button type="button" class="button compact" data-action="export-session">Download</button></div><dl class="properties"><dt>Participant</dt><dd>${e(item.participant)}</dd><dt>Status</dt><dd>${e(sessionStatuses[item.status])}</dd><dt>Started</dt><dd>${e(date(item.startedAt))}</dd><dt>Synced</dt><dd>${e(date(item.syncedAt))}</dd>${sessionBranchProperties(item)}</dl>${detailSection("Completed work", item.sync?.workCompleted)}${detailSection("Decisions", item.sync?.decisions)}${detailSection("Blockers", item.sync?.blockers)}${detailSection("Next steps", item.sync?.nextSteps)}${evidence(item.sync)}`;
  }
  if (!demo) {
    const linkButton = document.createElement("button");
    linkButton.type = "button";
    linkButton.className = "button compact";
    linkButton.dataset.action = "copy-link";
    linkButton.textContent = "Copy link";
    $("detail").querySelector(".detail-actions").append(linkButton);
  }
  if (isFeature) {
    const readOnly = !!item.archivedAt || !!currentProject()?.archivedAt;
    $("detail").querySelectorAll('[data-check], [data-action="edit-feature"], [data-action="copy-feature"]').forEach((element) => { element.disabled = demo || readOnly; });
    $("detail").querySelector(".properties").insertAdjacentHTML("beforeend", `<dt>Priority</dt><dd>${e(priorities[item.priority || "normal"])}</dd><dt>Due date</dt><dd class="${isOverdue(item) ? "overdue" : ""}">${e(dueLabel(item.dueDate))}</dd>${item.archivedAt ? '<dt>Archived</dt><dd>' + e(date(item.archivedAt)) + '</dd>' : ''}`);
    $("detail").querySelector(".detail-actions").insertAdjacentHTML("beforeend", `<button type="button" class="text-button" data-action="archive-feature" ${demo || currentProject()?.archivedAt ? "disabled" : ""}>${item.archivedAt ? "Restore feature" : "Archive feature"}</button>`);
    $("detail").insertAdjacentHTML("beforeend", `<section class="detail-section discussion"><h3>Discussion <span class="subtle">${item.comments?.length || 0}</span></h3>${(item.comments || []).map((comment) => `<article class="comment"><div class="comment-heading"><strong>${e(comment.author)}</strong><time datetime="${e(comment.createdAt)}">${e(date(comment.createdAt))}</time></div><p>${e(comment.text)}</p>${!demo && !readOnly && (comment.userId === data.user.id || data.selectedTeam.ownerUserId === data.user.id) ? '<button type="button" class="text-button" data-remove-comment="' + e(comment.id) + '">Remove comment</button>' : ''}</article>`).join("") || '<p class="subtle">Questions, decisions, and context for your teammates. Agents can read these when starting work.</p>'}${!readOnly ? `<form id="comment-form" class="form"><label for="comment-text">Add a comment</label><textarea id="comment-text" name="text" rows="3" maxlength="2000" required ${demo ? "disabled" : ""}>${e(commentDrafts.get(item.id) || "")}</textarea><p class="form-error" role="alert"></p><button class="button" type="submit" ${demo ? "disabled" : ""}>Post comment</button></form>` : '<p class="subtle">Restore this feature and project to continue the discussion.</p>'}</section>`);
    if (commentFocus && $("comment-text")) { $("comment-text").focus({ preventScroll: true }); $("comment-text").setSelectionRange(commentFocus.start, commentFocus.end); }
  }
}
function renderTeam() {
  const team = data.selectedTeam;
  if (!team) return;
  // Background member refreshes must not discard a name being typed.
  if (document.activeElement?.id === "team-name-input" && !$("team-name-form")?.dataset.busy) return;
  const owner = team.ownerUserId === data.user.id;
  $("team-content").innerHTML = `<h1>Team & invitations</h1><p>Manage who works in ${e(team.name)}.</p><section class="team-section"><h2>Team name</h2><form id="team-name-form" class="form"><div class="team-name-form"><label class="sr-only" for="team-name-input">Team name</label><input id="team-name-input" name="name" value="${e(team.name)}" minlength="2" maxlength="120" required ${!owner || demo ? "disabled" : ""}/><button class="button" type="submit" ${!owner || demo ? "disabled" : ""}>Save</button></div><p class="form-error" role="alert"></p></form></section><section class="team-section"><h2>Invite a teammate</h2><p>Share a code or link. They’ll log in or create an account, then join this team.</p><div class="copy-field"><div><span>Invite code</span><code class="team-code">${e(team.joinCode)}</code></div><button class="button compact" type="button" data-action="copy-team">Copy code</button></div><div class="team-invite-actions"><button class="button" data-action="copy-invite" type="button">Copy invite link</button>${owner ? '<button class="button" data-action="reset-code" type="button"' + (demo ? " disabled" : "") + '>Reset code</button>' : ""}</div><p class="subtle" style="margin-top:16px">This code is for invitations only. Agent connections use browser sign-in or a personal key. Reset the code if an invitation was shared too widely.</p></section><section class="team-section"><h2>Members <span class="subtle">${members.length}</span></h2>${memberError ? '<p class="form-error">' + e(memberError) + '</p><button class="button" type="button" data-action="retry-members">Retry</button>' : ""}${members.map((member) => `<div class="team-member"><span class="avatar" aria-hidden="true">${e(initial(member.name))}</span><div><strong>${e(member.name)}${member.userId === data.user.id ? ' <span class="subtle">(you)</span>' : ""}</strong><small>${e(member.email)}</small></div><span>${member.role === "owner" ? "Owner" : "Member"}</span>${owner && member.userId !== data.user.id ? '<button class="text-button" type="button" data-remove-member="' + e(member.userId) + '"' + (demo ? " disabled" : "") + '>Remove</button>' : ""}</div>`).join("") || (!memberError ? '<p class="subtle">Loading members…</p>' : "")}${!owner ? '<div class="team-invite-actions"><button class="button" type="button" data-action="leave-team"' + (demo ? " disabled" : "") + '>Leave team</button></div>' : ""}</section>`;
}
function switchView(next) {
  view = next; selection = null; setMobileNav(false);
  if (!["work", "map"].includes(next) && ["priority", "due"].includes($("sort").value)) $("sort").value = "updated";
  $("owner-filter").value = "all"; $("status-filter").value = "all";
  render();
  if (view === "team") loadMembers();
}
function setAuthMode(mode) {
  authMode = mode;
  $("auth-title").textContent = mode === "signup" ? "Create your account" : "Log in to Collavibe";
  $("name-field").hidden = mode !== "signup";
  $("auth-form").elements.name.required = mode === "signup";
  $("auth-form").elements.password.autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("auth-form").querySelector('[type="submit"]').textContent = mode === "signup" ? "Create account" : "Log in";
  $("password-hint").hidden = mode !== "signup";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.authMode === mode)));
  $("auth-error").textContent = "";
}
function setTeamMode(mode) {
  $("team-title").textContent = mode === "join" ? "Join a team" : "Create a team";
  $("create-team-form").hidden = mode !== "create";
  $("join-team-form").hidden = mode !== "join";
  document.querySelectorAll("[data-team-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.teamMode === mode)));
}
function openProject() {
  if (!canWrite()) return;
  $("project-form").reset(); $("project-form").querySelector(".form-error").textContent = "";
  $("project-dialog").showModal();
}
function openFeature(item = null) {
  if (!canWrite() || !currentProject() || currentProject().archivedAt || item?.archivedAt) return;
  editingFeature = item ? structuredClone(item) : null;
  const form = $("feature-form"); form.reset(); form.querySelector(".form-error").textContent = "";
  $("feature-dialog-title").textContent = item ? "Edit feature" : "New feature";
  for (const name of ["title", "description", "status", "owner", "branch", "priority", "dueDate"]) form.elements[name].value = item?.[name] || (name === "status" ? "planned" : name === "priority" ? "normal" : "");
  form.elements.checklist.value = item?.checklist.map((check) => check.text).join("\n") || "";
  $("feature-dialog").showModal();
}
function setupValues() {
  const project = currentProject();
  return {
    mcp: mcpUrl,
    command: "codex mcp add collavibe --url " + mcpUrl,
    claude: "claude mcp add --transport http --scope user collavibe " + mcpUrl,
    cursor: JSON.stringify({ mcpServers: { collavibe: { url: mcpUrl } } }, null, 2),
    start: `Use the Collavibe MCP with the team I authorized during sign-in.${project ? ' The repository is "' + project.root + '".' : ""} Inspect the local Git state and call start_collaboration_session with a sanitized repository snapshot. Show recent teammate work and available features. Ask me what to work on and wait for my choice before editing code.`,
    sync: `Use the Collavibe MCP. Get the sync template for this chat's collaboration session. Inspect the final Git state. Summarize completed work, decisions, blockers, and next steps, then call sync_collaboration_session. Do not commit or push just because I asked to sync.`,
  };
}
function renderAgentSetup() {
  const values = setupValues();
  $("setup-mcp-url").textContent = values.mcp;
  $("setup-start-prompt").textContent = values.start;
  $("setup-sync-prompt").textContent = values.sync;
  const guides = {
    codex: '<p class="subtle">In MCP settings, add a remote server named Collavibe with the URL above. Choose browser sign-in / OAuth when offered and approve only the team you want to connect.</p><p class="subtle">Or add it from the terminal:</p><pre>' + e(values.command) + '</pre><button class="button compact" data-copy-setup="command" type="button">Copy command</button><ol><li>Run the command, then <code>codex mcp login collavibe</code>.</li><li>Sign in to Collavibe in the browser and choose your team.</li><li>Open your repository and send the start prompt below.</li></ol>',
    claude: '<p class="subtle">In Claude Desktop or claude.ai, open Settings → Connectors → Add custom connector. Enter Collavibe and the MCP URL above. Connect, sign in to Collavibe, and approve a team. Enable the connector in your chat. Custom connectors depend on your plan and workspace settings.</p><a class="button" href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">Open Claude connectors ↗</a><p class="subtle">For Claude Code:</p><pre>' + e(values.claude) + '</pre><button class="button compact" data-copy-setup="claude" type="button">Copy command</button><p class="subtle">Then run <code>/mcp</code> in Claude Code and complete the browser sign-in.</p>',
    cursor: '<p class="subtle">Open Cursor Settings → Tools & MCP and add a remote MCP server, or merge this entry into your existing <code>~/.cursor/mcp.json</code>. Keep other server entries. Connect and complete the browser sign-in.</p><pre>' + e(values.cursor) + '</pre><button class="button compact" data-copy-setup="cursor" type="button">Copy configuration</button>',
    chatgpt: '<p class="subtle">In this desktop app, open Plugins → + → Add custom MCP server, enter the URL above, and choose OAuth / browser authentication. Sign in to Collavibe and choose your team. Enable the connection in your chat. Labels and availability vary by app version, plan, and workspace policy.</p><p class="subtle">If your ChatGPT client does not offer custom MCP connections, use an MCP-capable coding agent such as Codex CLI, Claude Code, or Cursor. The website still works in your phone’s browser.</p>',
    other: '<p class="subtle">Add the URL as a remote Streamable HTTP MCP server. The client discovers the OAuth endpoints, opens Collavibe in your browser, and lets you choose a team. If it supports only custom Authorization headers, use a personal key below.</p>',
  };
  $("agent-instructions").innerHTML = '<div class="agent-guide">' + guides[$("agent-client").value] + "</div>";
}
async function openAgent() {
  issuedKey = ""; $("issued-agent-key").hidden = true; $("agent-key-value").value = "";
  $("agent-key-form").reset(); $("agent-key-form").querySelector(".form-error").textContent = "";
  $("agent-key-form").querySelector('[type="submit"]').disabled = demo || data.deploymentMode !== "cloud";
  $("agent-key-example").textContent = '[mcp_servers.collavibe]\nurl = "' + mcpUrl + '"\nbearer_token_env_var = "COLLAVIBE_AGENT_KEY"\n\n# Put the key in your agent process environment, not in chat or Git.';
  renderAgentSetup(); $("agent-connect-dialog").showModal();
  await loadConnections();
}
async function loadConnections() {
  const expectedTeam = teamId;
  $("agent-connections").textContent = "Loading connections…";
  if (demo) { $("agent-connections").textContent = "Sign in to manage your own connections."; return; }
  try {
    const result = await api("/api/teams/" + teamId + "/agent-connections");
    if (teamId !== expectedTeam) return;
    connections = result.connections;
    $("agent-connections").innerHTML = result.available ? connections.map((item) => {
      const expired = new Date(item.refresh_expires_at || item.expires_at).getTime() <= Date.now();
      const state = item.revoked_at ? "Revoked" : expired ? "Expired" : item.client_id ? "Browser sign-in" : "Personal key";
      return '<div class="agent-connection"><div><strong>' + e(item.label) + '</strong><small>' + e(state) + ' · created ' + e(date(item.created_at)) + '<br>Last used: ' + e(date(item.last_used_at)) + '</small></div>' + (!item.revoked_at && !expired ? '<button class="button compact" type="button" data-revoke-connection="' + e(item.id) + '">Revoke</button>' : '') + '</div>';
    }).join("") || '<p class="subtle">No connections yet. Add Collavibe in your agent and complete browser sign-in, or create a personal key below.</p>' : '<p class="subtle">Agent connections require the hosted service.</p>';
  } catch (error) { $("agent-connections").textContent = error.message; }
}
async function showConsent() {
  showGate("consent");
  $("consent-form").querySelector('[type="submit"]').disabled = true;
  try {
    const request = await api("/api/oauth/request/" + encodeURIComponent(authorizationId));
    $("consent-title").textContent = "Connect " + request.clientName;
    $("consent-description").textContent = "Choose one team. This agent will act as " + data.user.name + ".";
    $("consent-destination").textContent = "Return to: " + request.redirectOrigin + ". Client names are supplied by the app. Only approve a connection you just requested.";
    $("consent-team").innerHTML = data.teams.map((item) => '<option value="' + e(item.id) + '"' + (item.id === teamId ? ' selected' : '') + '>' + e(item.name) + '</option>').join("");
    $("consent-form").querySelector(".form-error").textContent = "";
    $("consent-form").querySelector('[type="submit"]').disabled = false;
  } catch (error) { $("consent-form").querySelector(".form-error").textContent = error.message; }
}
async function finishConsent(allow) {
  const result = await api("/api/oauth/approve", { method: "POST", body: JSON.stringify({ requestId: authorizationId, teamId: $("consent-team").value || undefined, allow }) });
  location.assign(result.redirect);
}
async function confirmAction(title, message, action) {
  $("confirm-title").textContent = title; $("confirm-message").textContent = message;
  const dialog = $("confirm-dialog"); const accept = $("confirm-accept"); accept.disabled = false;
  return new Promise((resolve) => {
    const cleanup = () => { accept.onclick = null; $("confirm-cancel").onclick = null; dialog.removeEventListener("cancel", cancelled); };
    const cancelled = () => { cleanup(); resolve(false); };
    $("confirm-cancel").onclick = () => { dialog.close(); cancelled(); };
    dialog.addEventListener("cancel", cancelled, { once: true });
    accept.onclick = async () => {
      accept.disabled = true;
      try { await action(); dialog.close(); cleanup(); resolve(true); }
      catch (error) { toast(error.message, true); accept.disabled = false; }
    };
    dialog.showModal();
  });
}
function handoffText(session) {
  const feature = data.features.find((item) => item.id === session.featureId);
  let text = "# " + (feature?.title || session.intent || "Session") + "\n\n";
  text += "Participant: " + session.participant + "\nStarted: " + date(session.startedAt) + "\nStatus: " + sessionStatuses[session.status] + "\n\n";
  if (!session.sync) return text + "No handoff has been synced yet.\n";
  text += session.sync.summary + "\n";
  for (const [key, title] of [["workCompleted", "Completed work"], ["decisions", "Decisions"], ["blockers", "Blockers"], ["nextSteps", "Next steps"], ["agentReportedFiles", "Changed files"]]) {
    if (session.sync[key]?.length) text += "\n## " + title + "\n\n" + session.sync[key].map((item) => "- " + item).join("\n") + "\n";
  }
  const verified = session.sync.verified;
  if (verified) {
    text += "\n## Git evidence\n\n" + (verified.source === "local_git" ? "Read from local Git." : "Reported by the agent, not independently checked by Collavibe.") + "\n" + verified.startHead + " → " + verified.endHead + "\n";
    text += verified.commits.map((commit) => "- " + commit.shortHash + " " + commit.subject).join("\n") + "\n";
  }
  return text;
}
function download(name, text, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filename(value) { return String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 100) || "collavibe"; }
function exportProject() {
  const project = currentProject(); if (!project) return;
  const payload = { exportedAt: new Date().toISOString(), project, features: currentFeatures(), sessions: currentSessions().map(({ teamCode, ...session }) => session) };
  download(filename(project.name) + ".json", JSON.stringify(payload, null, 2), "application/json");
  toast("Project export downloaded.");
}
async function saveChecklist(input) {
  if (!canWrite()) return;
  const item = data.features.find((feature) => feature.id === selection?.id); if (!item) return;
  const checked = input.checked;
  $("detail").querySelectorAll("[data-check]").forEach((box) => { box.disabled = true; });
  const editButton = $("detail").querySelector('[data-action="edit-feature"]');
  if (editButton) editButton.disabled = true;
  try {
    const checklist = item.checklist.map((check) => ({ ...check, done: check.id === input.dataset.check ? checked : check.done }));
    const status = item.status === "done" && checklist.some((check) => !check.done) ? "review" : item.status;
    await api("/api/teams/" + teamId + "/features/" + item.id, { method: "PATCH", body: JSON.stringify({ ...item, checklist, status, expectedUpdatedAt: item.updatedAt }) });
    await load(); toast("Checklist saved.");
  } catch (error) { toast(error.message, true); await load(); }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.dataset.closeDialog !== undefined) { const dialog = button.closest("dialog"); if (dialog.id === "agent-connect-dialog") clearAgentKey(); dialog.close(); return; }
    if (button.dataset.authMode) { setAuthMode(button.dataset.authMode); return; }
    if (button.dataset.teamMode) { setTeamMode(button.dataset.teamMode); return; }
    if (button.dataset.view) { switchView(button.dataset.view); return; }
    if (button.dataset.project) { projectId = button.dataset.project; localStorage.setItem("collavibe-project", projectId); selection = null; view = "map"; $("show-archived").checked = false; $("priority-filter").value = "all"; $("search").value = ""; $("owner-filter").value = "all"; $("status-filter").value = "all"; setMobileNav(false); render(); return; }
    if (button.dataset.feature) { selection = { kind: "feature", id: button.dataset.feature }; renderContent(); updateHash(); if (matchMedia("(max-width: 1250px)").matches) $("close-detail").focus(); return; }
    if (button.dataset.session) { selection = { kind: "session", id: button.dataset.session }; if (view !== "map") view = "sessions"; render(); if (matchMedia("(max-width: 1250px)").matches) $("close-detail").focus(); return; }
    if (["features", "people"].includes(button.dataset.mapGroup)) { mapGrouping = button.dataset.mapGroup; renderContent(); document.querySelector('[data-map-group="' + mapGrouping + '"]').focus({ preventScroll: true }); return; }
    if (button.dataset.mapExpand) { $("work-content").querySelectorAll("details[data-map-node]").forEach((node) => { node.open = button.dataset.mapExpand === "all"; if (node.open) collapsedMapNodes.delete(node.dataset.mapNode); else collapsedMapNodes.add(node.dataset.mapNode); }); return; }
    if (button.dataset.copySetup) { await copy(setupValues()[button.dataset.copySetup]); return; }
    if (button.dataset.removeComment && canWrite()) {
      const item = data.features.find((feature) => feature.id === selection?.id);
      await confirmAction("Remove this comment?", "This removes the selected comment from the team discussion.", async () => { await featureAction(item.id, { action: "remove-comment", commentId: button.dataset.removeComment }); await load(); toast("Comment removed."); }); return;
    }
    if (button.dataset.revokeConnection && canWrite()) {
      await confirmAction("Revoke this connection?", "The agent will lose access immediately. You can reconnect later.", async () => {
        await api("/api/teams/" + teamId + "/agent-connections/" + button.dataset.revokeConnection, { method: "DELETE" });
        await loadConnections(); toast("Connection revoked.");
      }); return;
    }
    if (button.dataset.removeMember && canWrite()) {
      const member = members.find((item) => item.userId === button.dataset.removeMember);
      await confirmAction("Remove " + member.name + "?", "They will lose website and agent access to this team. The invitation code will reset; other members’ agent connections keep working.", async () => {
        await api("/api/teams/" + teamId + "/members/" + member.userId, { method: "DELETE" }); await load(); await loadMembers(); toast("Member removed and team code reset.");
      }); return;
    }
    const action = button.dataset.action;
    if (action === "reset-map-filters") { $("search").value = ""; for (const id of ["owner-filter", "status-filter", "priority-filter"]) $(id).value = "all"; $("show-archived").checked = false; renderContent(); }
    if (action === "add-project") openProject();
    if (action === "new-feature") openFeature();
    if (action === "show-active") { $("show-archived").checked = false; renderContent(); }
    if (action === "connect-agent") openAgent();
    if (action === "edit-feature") openFeature(data.features.find((item) => item.id === selection?.id));
    if (action === "archive-feature" && canWrite()) {
      const item = data.features.find((feature) => feature.id === selection?.id);
      await confirmAction(item.archivedAt ? "Restore this feature?" : "Archive this feature?", item.archivedAt ? "It will appear in available work again." : "Its checklist, discussion, and sessions will be kept. Agents will no longer be offered this work.", async () => {
        await featureAction(item.id, { action: "archive", archived: !item.archivedAt, expectedUpdatedAt: item.updatedAt });
        $("show-archived").checked = !item.archivedAt; await load(); toast(item.archivedAt ? "Feature restored." : "Feature archived.");
      });
    }
    if (action === "copy-feature") {
      const item = data.features.find((feature) => feature.id === selection?.id);
      await copy(setupValues().start + ' I want to work on feature "' + item.title + '" (feature ID: ' + item.id + "). Load its current checklist and ask me to confirm before claiming it.");
    }
    if (action === "copy-handoff") await copy(handoffText(data.sessions.find((item) => item.id === selection?.id)));
    if (action === "export-session") { const session = data.sessions.find((item) => item.id === selection?.id); download(filename(session.participant + "-" + session.id) + ".md", handoffText(session)); }
    if (action === "copy-team") await copy(data.selectedTeam.joinCode);
    if (action === "copy-invite") await copy(location.origin + "/?join=" + encodeURIComponent(data.selectedTeam.joinCode));
    if (action === "retry-members") await loadMembers();
    if (action === "copy-link") { updateHash(); await copy(location.href); }
    if (action === "reset-code" && canWrite()) await confirmAction("Reset the team code?", "Old invite links will stop working. Existing members and agent connections remain unchanged.", async () => { await api("/api/teams/" + teamId + "/rotate-code", { method: "POST" }); await load(); toast("Team code reset."); });
    if (action === "leave-team" && canWrite()) await confirmAction("Leave this team?", "You will need a new invitation to rejoin. The code will reset for remaining teammates.", async () => { await api("/api/teams/" + teamId + "/members/" + data.user.id, { method: "DELETE" }); teamId = ""; members = []; await load(); toast("You left the team."); });
  } catch (error) { toast(error.message, true); }
});
$("auth-form").addEventListener("submit", (event) => {
  event.preventDefault();
  formAction(event.currentTarget, async () => {
    const body = Object.fromEntries(new FormData($("auth-form")));
    await api("/api/auth/" + authMode, { method: "POST", body: JSON.stringify(body) });
    $("auth-form").reset(); members = []; await load();
  });
});
for (const [id, path] of [["create-team-form", "/api/teams"], ["join-team-form", "/api/teams/join"]]) {
  $(id).addEventListener("submit", (event) => {
    event.preventDefault(); const form = event.currentTarget;
    formAction(form, async () => {
      const result = await api(path, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      teamId = result.team.id; invitation = ""; members = [];
      history.replaceState(null, "", location.pathname + (authorizationId ? "?authorize=" + encodeURIComponent(authorizationId) : "")); form.reset(); view = "map";
      await load(); toast(id === "create-team-form" ? "Team created." : "You joined the team.");
    });
  });
}
$("project-form").addEventListener("submit", (event) => {
  event.preventDefault(); if (!canWrite()) return;
  formAction(event.currentTarget, async () => {
    const result = await api("/api/teams/" + teamId + "/projects", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData($("project-form")))) });
    projectId = result.project.id; selection = null; view = "map"; $("project-dialog").close(); await load(); toast("Project added. You can now plan features.");
  });
});
$("feature-form").addEventListener("submit", (event) => {
  event.preventDefault(); if (!canWrite()) return;
  formAction(event.currentTarget, async () => {
    const body = Object.fromEntries(new FormData($("feature-form")));
    const unused = [...(editingFeature?.checklist || [])];
    body.checklist = body.checklist.split("\n").map((line) => line.trim()).filter(Boolean).map((text) => {
      const index = unused.findIndex((item) => item.text === text);
      return index === -1 ? { text, done: false } : unused.splice(index, 1)[0];
    });
    const url = editingFeature ? "/api/teams/" + teamId + "/features/" + editingFeature.id : "/api/teams/" + teamId + "/projects/" + projectId + "/features";
    if (editingFeature) body.expectedUpdatedAt = editingFeature.updatedAt;
    const result = await api(url, { method: editingFeature ? "PATCH" : "POST", body: JSON.stringify(body) });
    if (!editingFeature) { $("show-archived").checked = false; $("priority-filter").value = "all"; $("status-filter").value = "all"; $("owner-filter").value = "all"; $("search").value = ""; }
    selection = { kind: "feature", id: result.feature.id }; $("feature-dialog").close();
    await load(); toast("Feature saved.");
  });
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "comment-form") {
    event.preventDefault(); if (!canWrite() || postingComment) return;
    const form = event.target, id = selection.id, text = form.elements.text.value.trim();
    formAction(form, async () => {
      postingComment = id;
      try { await featureAction(id, { action: "comment", text }); commentDrafts.delete(id); toast("Comment posted."); }
      finally { postingComment = ""; }
      await load();
    }); return;
  }
  if (event.target.id !== "team-name-form") return;
  event.preventDefault(); if (!canWrite()) return;
  const form = event.target;
  formAction(form, async () => { await api("/api/teams/" + teamId, { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); await load(); toast("Team name saved."); });
});
function featureAction(id, body) { return api("/api/teams/" + teamId + "/features/" + id + "/actions", { method: "POST", body: JSON.stringify(body) }); }
$("detail").addEventListener("input", (event) => { if (event.target.id === "comment-text") commentDrafts.set(selection.id, event.target.value); });
$("project-settings").addEventListener("click", () => {
  if (!canWrite()) return;
  editingProject = structuredClone(currentProject());
  const form = $("project-settings-form"); form.reset(); form.querySelector(".form-error").textContent = "";
  form.elements.name.value = editingProject.name; form.elements.archived.checked = !!editingProject.archivedAt;
  $("project-settings-dialog").showModal();
});
$("project-settings-form").addEventListener("submit", (event) => {
  event.preventDefault(); if (!canWrite()) return;
  formAction(event.currentTarget, async () => {
    const form = $("project-settings-form");
    await api("/api/teams/" + teamId + "/projects/" + editingProject.id, { method: "PATCH", body: JSON.stringify({ name: form.elements.name.value, archived: form.elements.archived.checked, expectedUpdatedAt: editingProject.updatedAt }) });
    $("project-settings-dialog").close(); await load(); toast("Project settings saved.");
  });
});
// Keep these fields adjacent to status/owner in the existing edit form.
$("feature-form").elements.branch.closest("label").insertAdjacentHTML("beforebegin", '<div class="form-grid"><label>Priority<select name="priority"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Due date<input name="dueDate" type="date"/></label></div>');
$("sort").insertAdjacentHTML("beforeend", '<option value="priority">Priority first</option><option value="due">Due date</option>');
$("detail").addEventListener("change", (event) => { if (event.target.matches("[data-check]")) saveChecklist(event.target); });
$("search").addEventListener("input", renderContent);
$("work-content").addEventListener("toggle", (event) => {
  const node = event.target;
  if (!node.matches("details[data-map-node]") || !node.isConnected) return;
  if (node.open) collapsedMapNodes.delete(node.dataset.mapNode); else collapsedMapNodes.add(node.dataset.mapNode);
}, true);
for (const id of ["owner-filter", "status-filter", "sort", "priority-filter", "show-archived"]) $(id).addEventListener("change", renderContent);
function closeDetail() {
  const previous = selection;
  selection = null; renderContent(); updateHash();
  if (previous) document.querySelector('[data-' + previous.kind + '="' + CSS.escape(previous.id) + '"]')?.focus({ preventScroll: true });
}
$("close-detail").addEventListener("click", closeDetail);
$("sidebar-add-project").addEventListener("click", openProject);
$("new-feature").addEventListener("click", () => openFeature());
$("export-project").addEventListener("click", exportProject);
$("open-agent-setup").addEventListener("click", openAgent);
$("copy-repository").addEventListener("click", () => {
  const repo = repositoryPresentation(currentProject(), demo);
  if (repo) copy(repo.url).catch((error) => toast(error.message, true));
});
$("agent-client").addEventListener("change", renderAgentSetup);
$("agent-key-form").addEventListener("submit", (event) => {
  event.preventDefault(); if (!canWrite()) return;
  formAction(event.currentTarget, async () => {
    const form = $("agent-key-form");
    const expectedTeam = teamId;
    const result = await api("/api/teams/" + teamId + "/agent-connections", { method: "POST", body: JSON.stringify({ label: form.elements.label.value, days: Number(form.elements.days.value) }) });
    if (expectedTeam !== teamId || !$("agent-connect-dialog").open) { toast("Key created. Revoke it from Your connections if you no longer need it."); return; }
    issuedKey = result.token; $("agent-key-value").value = issuedKey; $("issued-agent-key").hidden = false;
    form.reset(); await loadConnections(); toast("Key created. Copy it before closing this window.");
  });
});
$("copy-agent-key").addEventListener("click", () => copy(issuedKey).catch((error) => toast(error.message, true)));
function clearAgentKey() { issuedKey = ""; $("agent-key-value").value = ""; $("issued-agent-key").hidden = true; }
$("agent-connect-dialog").addEventListener("close", clearAgentKey);
$("agent-connect-dialog").addEventListener("cancel", clearAgentKey);
$("consent-form").addEventListener("submit", (event) => { event.preventDefault(); formAction(event.currentTarget, () => finishConsent(true)); });
$("deny-agent").addEventListener("click", async () => {
  try { await finishConsent(false); }
  catch { authorizationId = ""; history.replaceState(null, "", location.pathname); await load(); }
});
$("refresh").addEventListener("click", () => demo ? toast("This workspace contains sample data.") : load());
$("team-select").addEventListener("change", async () => {
  teamId = $("team-select").value; members = []; selection = null; fingerprint = "";
  $("work-content").innerHTML = '<p class="count-summary">Loading team…</p>';
  $("detail-pane").hidden = true; $("team-content").innerHTML = ""; $("new-feature").disabled = true;
  await load();
});
$("add-team").addEventListener("click", () => { if (!canWrite()) return; $("back-workspace").hidden = false; setTeamMode("create"); showGate("team"); });
$("back-workspace").addEventListener("click", () => { invitation = ""; showGate("workspace"); });
$("mobile-projects").addEventListener("click", () => setMobileNav(!$("workspace").classList.contains("mobile-nav")));
for (const id of ["close-navigation", "nav-backdrop"]) $(id).addEventListener("click", () => { setMobileNav(false); $("mobile-projects").focus(); });
document.querySelector(".main").addEventListener("click", (event) => { if (!event.target.closest("#mobile-projects")) setMobileNav(false); });
async function logout() {
  if (demo) { await leaveSample(); return; }
  try { if (!demo) await api("/api/auth/logout", { method: "POST" }); }
  catch (error) { toast(error.message, true); return; }
  commentDrafts.clear(); issuedKey = ""; connections = []; $("agent-key-value").value = ""; document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  requestSequence++; busyLoad = false; demo = false; members = []; fingerprint = ""; selection = null; view = "map";
  data = { user: null, teams: [], projects: [], features: [], sessions: [] };
  teamId = ""; projectId = ""; localStorage.removeItem("collavibe-team"); localStorage.removeItem("collavibe-project");
  history.replaceState(null, "", location.pathname + (authorizationId ? "?authorize=" + encodeURIComponent(authorizationId) : "")); $("search").value = ""; setAuthMode("login"); showGate("auth");
}
$("logout").addEventListener("click", logout);
$("team-logout").addEventListener("click", logout);
async function leaveSample() {
  requestSequence++; busyLoad = false; demo = false; members = []; fingerprint = ""; selection = null; view = "map";
  data = { user: null, teams: [], projects: [], features: [], sessions: [] };
  teamId = localStorage.getItem("collavibe-team") || ""; projectId = localStorage.getItem("collavibe-project") || "";
  const url = new URL(location.href); url.searchParams.delete("demo"); url.hash = "";
  history.replaceState(null, "", url.pathname + url.search);
  setMobileNav(false); showGate("auth"); setAuthMode("login");
  await load();
}
$("exit-demo").addEventListener("click", leaveSample);
function enterDemo() {
  requestSequence++; busyLoad = false; demo = true; data = sampleWorkspace();
  members = data.members; memberError = ""; teamId = data.selectedTeam.id; projectId = data.projects[0].id; view = "map"; selection = null;
  $("connection-label").textContent = "Sample data"; $("connection-label").classList.remove("offline"); $("load-error").hidden = true;
  $("search").value = ""; $("owner-filter").value = "all"; $("status-filter").value = "all";
  showGate("workspace"); render();
}
hydrateIcons();
initializeLanding({ setAuthMode, copy, invitation, authorizationId });
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { if (dialog.id === "confirm-dialog") $("confirm-cancel").click(); else dialog.close(); } });
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !$("workspace").hidden && !document.querySelector("dialog[open]")) { event.preventDefault(); if (view === "team") switchView("map"); $("project-filters").open = true; $("search").focus(); }
  if (event.key === "Escape" && !document.querySelector("dialog[open]")) { const navWasOpen = $("workspace").classList.contains("mobile-nav"); setMobileNav(false); if (selection) closeDetail(); if (navWasOpen) $("mobile-projects").focus(); updateHash(); }
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !demo && !$("workspace").hidden) load({ quiet: true }); });
window.addEventListener("online", () => { if (!demo) load(); });
window.addEventListener("resize", () => { if (!matchMedia("(max-width: 700px)").matches) setMobileNav(false); });
setInterval(() => { if (!demo && !document.hidden && !$("workspace").hidden) load({ quiet: true }); }, 20000);
setAuthMode("login"); setTeamMode("create");
if (new URLSearchParams(location.search).get("demo") === "1") enterDemo(); else load();
