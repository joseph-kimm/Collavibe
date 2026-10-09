const elements = {
  authGate: document.querySelector("#auth-gate"), teamGate: document.querySelector("#team-gate"), workspace: document.querySelector("#workspace"),
  authForm: document.querySelector("#auth-form"), authTitle: document.querySelector("#auth-title"), authError: document.querySelector("#auth-error"), nameField: document.querySelector("#name-field"),
  createTeamForm: document.querySelector("#create-team-form"), joinTeamForm: document.querySelector("#join-team-form"), teamTitle: document.querySelector("#team-title"),
  projectName: document.querySelector("#project-name"), projectMeta: document.querySelector("#project-meta"), projectTree: document.querySelector("#project-tree"),
  activity: document.querySelector("#activity"), detail: document.querySelector("#detail"), selectionStatus: document.querySelector("#selection-status"),
  currentBranch: document.querySelector("#current-branch"), currentHead: document.querySelector("#current-head"), refresh: document.querySelector("#refresh"),
  connectionLabel: document.querySelector("#connection-label"), teamSelect: document.querySelector("#team-select"), teamCode: document.querySelector("#team-code"), copyCode: document.querySelector("#copy-code"),
  accountButton: document.querySelector("#account-button"), accountMenu: document.querySelector("#account-menu"), accountName: document.querySelector("#account-name"), accountEmail: document.querySelector("#account-email"),
  logout: document.querySelector("#logout"), teamLogout: document.querySelector("#team-logout"), addTeam: document.querySelector("#add-team"), backWorkspace: document.querySelector("#back-workspace"),
  openAgentSetup: document.querySelector("#open-agent-setup"), agentDialog: document.querySelector("#agent-connect-dialog"), closeAgentSetup: document.querySelector("#close-agent-setup"),
  setupMcpUrl: document.querySelector("#setup-mcp-url"), setupTeamCode: document.querySelector("#setup-team-code"), setupStarterPrompt: document.querySelector("#setup-starter-prompt"), setupCopyStatus: document.querySelector("#setup-copy-status"),
  setupCodexCommand: document.querySelector("#setup-codex-command"), setupClaudeCommand: document.querySelector("#setup-claude-command"), setupCursorJson: document.querySelector("#setup-cursor-json"),
};

let dashboard = { user: null, teams: [], selectedTeam: null, projects: [], features: [], sessions: [] };
let selectedTeamId = localStorage.getItem("collavibe-team") || "";
let selectedFeatureId = null;
let authMode = "signup";
let teamMode = "create";
let latestFingerprint = "";
let loadSequence = 0;
const hostedMcpUrl = "https://collavibe.vercel.app/mcp";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const shortDate = (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function setAgentPlatform(platform) {
  document.querySelectorAll("[data-agent-platform]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.agentPlatform === platform));
  });
  document.querySelectorAll("[data-agent-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.agentPanel !== platform;
  });
}

function agentSetupValues() {
  const teamCode = dashboard.selectedTeam?.joinCode || "YOUR_TEAM_CODE";
  const participant = dashboard.user?.name || "Your name";
  return {
    mcp: hostedMcpUrl,
    team: teamCode,
    codex: `codex mcp add collavibe --url ${hostedMcpUrl}`,
    claude: `claude mcp add --transport http --scope user collavibe ${hostedMcpUrl}`,
    cursor: JSON.stringify({ mcpServers: { collavibe: { url: hostedMcpUrl } } }, null, 2),
    prompt: `Use the Collavibe MCP. My team code is "${teamCode}" and my name is "${participant}". Inspect this repository, start a collaboration session, show me the available work options and recent teammate activity, and wait for me to choose before editing anything.`,
  };
}

function hydrateAgentSetup() {
  const values = agentSetupValues();
  elements.setupMcpUrl.textContent = values.mcp;
  elements.setupTeamCode.textContent = values.team;
  elements.setupStarterPrompt.textContent = values.prompt;
  elements.setupCodexCommand.textContent = values.codex;
  elements.setupClaudeCommand.textContent = values.claude;
  elements.setupCursorJson.textContent = values.cursor;
  elements.setupCopyStatus.textContent = "";
}

function openAgentSetup() {
  hydrateAgentSetup();
  setAgentPlatform("chatgpt");
  if (!elements.agentDialog.open) elements.agentDialog.showModal();
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Something went wrong.");
  return data;
}

function show(view) {
  elements.authGate.hidden = view !== "auth";
  elements.teamGate.hidden = view !== "team";
  elements.workspace.hidden = view !== "workspace";
  document.body.classList.remove("app-loading");
  document.body.dataset.view = view;
}

async function load({ quiet = false } = {}) {
  const sequence = ++loadSequence;
  if (!quiet) {
    elements.refresh.disabled = true;
    elements.refresh.textContent = "Refreshing…";
  }
  try {
    const statusResponse = await fetch("/api/auth/status", { cache: "no-store" });
    const authStatus = await statusResponse.json();
    if (!statusResponse.ok) throw new Error(authStatus.error || "Could not check account status.");
    if (!authStatus.authenticated) {
      dashboard = { user: null, teams: [], selectedTeam: null, projects: [], features: [], sessions: [] };
      show("auth");
      return;
    }
    const query = selectedTeamId ? `?teamId=${encodeURIComponent(selectedTeamId)}` : "";
    const response = await fetch(`/api/dashboard${query}`, { cache: "no-store" });
    if (response.status === 401) {
      dashboard = { user: null, teams: [], selectedTeam: null, projects: [], features: [], sessions: [] };
      show("auth");
      return;
    }
    const nextDashboard = await response.json();
    if (!response.ok) throw new Error(nextDashboard.error || "Could not load workspace.");
    if (sequence !== loadSequence) return;
    dashboard = nextDashboard;
    const cloudMode = dashboard.deploymentMode === "cloud";
    const repoField = document.querySelector("#create-repo-field");
    repoField.hidden = cloudMode;
    repoField.querySelector("input").required = !cloudMode;
    if (dashboard.selectedTeam) {
      selectedTeamId = dashboard.selectedTeam.id;
      localStorage.setItem("collavibe-team", selectedTeamId);
    }
    if (!dashboard.teams.length) {
      elements.backWorkspace.hidden = true;
      const repoInput = elements.createTeamForm.elements.repoPath;
      if (!repoInput.value) repoInput.value = dashboard.defaultRepoPath || "";
      show("team");
      return;
    }
    show("workspace");
    const fingerprint = JSON.stringify(dashboard);
    if (fingerprint !== latestFingerprint) {
      latestFingerprint = fingerprint;
      render();
    }
    elements.connectionLabel.textContent = `Connected · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch (error) {
    if (elements.workspace.hidden) {
      elements.authError.textContent = error.message;
    } else {
      elements.connectionLabel.textContent = error.message;
    }
  } finally {
    if (!quiet) {
      elements.refresh.disabled = false;
      elements.refresh.textContent = "Refresh";
    }
  }
}

function render() {
  const project = dashboard.projects.at(-1);
  const team = dashboard.selectedTeam;
  elements.teamSelect.innerHTML = dashboard.teams.map((item) => `<option value="${item.id}" ${item.id === team?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  elements.teamCode.textContent = team?.joinCode || "—";
  elements.copyCode.disabled = !team?.joinCode;
  elements.accountName.textContent = dashboard.user.name;
  elements.accountEmail.textContent = dashboard.user.email;
  elements.accountButton.textContent = dashboard.user.name.slice(0, 1).toUpperCase();

  if (!project) {
    renderNoProject();
    return;
  }
  const features = dashboard.features.filter((feature) => feature.projectId === project.id);
  const sessions = dashboard.sessions.filter((session) => session.projectId === project.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!selectedFeatureId || !features.some((feature) => feature.id === selectedFeatureId)) selectedFeatureId = features[0]?.id || null;

  elements.projectName.textContent = project.name;
  elements.projectMeta.textContent = `${features.length} feature${features.length === 1 ? "" : "s"} · ${sessions.length} recorded session${sessions.length === 1 ? "" : "s"}`;
  elements.currentBranch.textContent = project.latestGit.branch;
  elements.currentHead.textContent = project.latestGit.head.slice(0, 7);
  renderTree(project, features);
  renderActivity(features, sessions);
  renderDetail(features.find((feature) => feature.id === selectedFeatureId), sessions);
}

function renderNoProject() {
  const cloudMode = dashboard.deploymentMode === "cloud";
  elements.projectName.textContent = "No repository yet";
  elements.projectMeta.textContent = cloudMode ? "Start the hosted MCP from a coding agent to connect a repository." : "Connect a local Git repository to this team.";
  elements.projectTree.innerHTML = "";
  elements.currentBranch.textContent = "—";
  elements.currentHead.textContent = "—";
  elements.selectionStatus.textContent = "Setup";
  elements.selectionStatus.className = "status";
  elements.activity.replaceChildren(document.querySelector(cloudMode ? "#connect-agent" : "#connect-project").content.cloneNode(true));
  elements.detail.innerHTML = `<p class="placeholder-detail">Once a repository is connected, its feature tree, teammate sessions, and ${cloudMode ? "agent-attested" : "verified"} commits will appear here.</p>`;
  if (cloudMode) {
    document.querySelector("#open-agent-setup-empty")?.addEventListener("click", openAgentSetup);
    return;
  }
  const form = document.querySelector("#connect-project-form");
  form.elements.repoPath.value = dashboard.defaultRepoPath || "";
  form.addEventListener("submit", connectProject);
}

function renderTree(project, features) {
  elements.projectTree.innerHTML = `<div class="tree-root">
    <div class="root-label"><span class="root-dot"></span><span>${escapeHtml(project.name)}</span><code>${project.latestGit.head.slice(0, 7)}</code></div>
    ${project.latestGit.branches.map((branch) => {
      const branchFeatures = features.filter((feature) => feature.branch === branch.name || (!feature.branch && branch.current));
      return `<div class="branch-group"><div class="branch-label"><strong>${branch.current ? "● " : ""}${escapeHtml(branch.name)}</strong><code>${escapeHtml(branch.head)}</code></div>
        <div class="feature-nodes">${branchFeatures.length ? branchFeatures.map((feature) => `<button class="tree-node ${feature.status} ${feature.id === selectedFeatureId ? "selected" : ""}" type="button" data-feature-id="${feature.id}" aria-pressed="${feature.id === selectedFeatureId}"><span>${escapeHtml(feature.title)}</span></button>`).join("") : '<span class="tree-node"><span>No recorded feature</span></span>'}</div></div>`;
    }).join("")}
  </div>`;
  elements.projectTree.querySelectorAll("[data-feature-id]").forEach((button) => button.addEventListener("click", () => {
    selectedFeatureId = button.dataset.featureId;
    render();
  }));
}

function renderActivity(features, sessions) {
  if (!sessions.length) {
    elements.activity.replaceChildren(document.querySelector("#empty-activity").content.cloneNode(true));
    return;
  }
  elements.activity.innerHTML = sessions.map((session, index) => {
    const feature = features.find((item) => item.id === session.featureId);
    const verified = session.sync?.verified;
    const attested = verified?.source === "agent_attested";
    return `<article class="session-entry ${session.status}" style="--delay:${index * 45}ms">
      <div class="session-meta"><strong>${escapeHtml(session.participant)}</strong><span>${shortDate(session.startedAt)}</span><span>${escapeHtml(session.startSnapshot.branch)}</span><span class="session-state">${escapeHtml(session.status)}</span></div>
      <h3>${escapeHtml(feature?.title || session.intent || "Choosing work")}</h3>
      <p class="session-summary">${escapeHtml(session.sync?.summary || "Session started. Waiting for the agent to sync its handoff.")}</p>
      ${verified ? `<div class="verified-row"><span class="verified-chip"><strong>${verified.commits.length}</strong> ${attested ? "reported" : "verified"} commits</span><span class="verified-chip"><strong>${verified.changedFiles.length}</strong> ${attested ? "reported" : "verified"} files</span>${verified.reportedButUnverified.length ? `<span class="verified-chip unverified"><strong>${verified.reportedButUnverified.length}</strong> unverified claims</span>` : ""}</div>` : ""}
    </article>`;
  }).join("");
}

function renderDetail(feature, sessions) {
  if (!feature) {
    elements.selectionStatus.textContent = "No selection";
    elements.selectionStatus.className = "status";
    elements.detail.innerHTML = '<p class="placeholder-detail">No feature has been recorded yet. Start a session and choose or define work from the agent chat.</p>';
    return;
  }
  const latestSession = sessions.find((session) => session.featureId === feature.id && session.sync);
  const verified = latestSession?.sync?.verified;
  const attested = verified?.source === "agent_attested";
  const branchTransition = verified && verified.startBranch !== verified.endBranch ? `<p class="branch-transition">${escapeHtml(verified.startBranch)} <span aria-hidden="true">→</span><span class="sr-only">to</span> ${escapeHtml(verified.endBranch)}</p>` : "";
  const verifiedCommits = verified?.commits.length ? `<ol class="commits">${verified.commits.map((commit) => `<li><code>${escapeHtml(commit.shortHash)}</code><span><strong>${escapeHtml(commit.subject)}</strong><small>${escapeHtml(commit.author)}</small></span></li>`).join("")}</ol>` : `<p class="placeholder-detail">No new commits were ${attested ? "reported" : "verified"}.</p>`;
  elements.selectionStatus.textContent = feature.status;
  elements.selectionStatus.className = `status ${feature.status}`;
  elements.detail.innerHTML = `<h3>${escapeHtml(feature.title)}</h3><p class="detail-description">${escapeHtml(feature.description)}</p>
    <div class="detail-block detail-grid"><div><span>Owner</span><strong>${escapeHtml(feature.owner || "Unclaimed")}</strong></div><div><span>Branch</span><strong>${escapeHtml(feature.branch || "Not set")}</strong></div></div>
    <div class="detail-block"><h4>Completion checklist</h4><ul class="checklist">${feature.checklist.map((item) => `<li class="${item.done ? "done" : ""}"><span class="checkmark" aria-hidden="true">${item.done ? "✓" : ""}</span><span><span class="sr-only">${item.done ? "Completed" : "Incomplete"}: </span>${escapeHtml(item.text)}</span></li>`).join("")}</ul></div>
    ${attested ? '<p class="evidence-note">Remote evidence was supplied by the coding agent and was not independently read from the developer’s filesystem.</p>' : ""}
    <div class="detail-block"><h4>${attested ? "Agent-attested" : "Verified"} commits</h4>${verified ? `${branchTransition}${verifiedCommits}` : '<p class="placeholder-detail">No completed sync for this feature yet.</p>'}</div>
    <div class="detail-block"><h4>${attested ? "Agent-attested" : "Verified"} files</h4>${verified ? `<ul class="files">${verified.changedFiles.map((file) => `<li>${escapeHtml(file)}</li>`).join("") || "<li>No changed files</li>"}</ul>` : '<p class="placeholder-detail">No completed sync for this feature yet.</p>'}</div>`;
}

function setAuthMode(mode) {
  authMode = mode;
  elements.authTitle.textContent = mode === "signup" ? "Create your account" : "Welcome back";
  elements.nameField.hidden = mode === "login";
  elements.nameField.querySelector("input").required = mode === "signup";
  elements.authForm.elements.password.autocomplete = mode === "signup" ? "new-password" : "current-password";
  elements.authForm.querySelector("button[type=submit]").textContent = mode === "signup" ? "Create account" : "Log in";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.authMode === mode)));
  elements.authError.textContent = "";
}

function setTeamMode(mode) {
  teamMode = mode;
  elements.teamTitle.textContent = mode === "create" ? "Create a team" : "Join your team";
  elements.createTeamForm.hidden = mode !== "create";
  elements.joinTeamForm.hidden = mode !== "join";
  document.querySelectorAll("[data-team-mode]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.teamMode === mode)));
  document.querySelectorAll("[data-team-error]").forEach((error) => { error.textContent = ""; });
}

async function submitAuth(event) {
  event.preventDefault();
  const submit = elements.authForm.querySelector("button[type=submit]");
  submit.disabled = true;
  elements.authError.textContent = "";
  try {
    const form = new FormData(elements.authForm);
    await request(`/api/auth/${authMode}`, { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    elements.authForm.reset();
    await load();
  } catch (error) {
    elements.authError.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

async function submitCreateTeam(event) {
  event.preventDefault();
  const error = elements.createTeamForm.querySelector("[data-team-error]");
  error.textContent = "";
  try {
    const body = Object.fromEntries(new FormData(elements.createTeamForm));
    const { team } = await request("/api/teams", { method: "POST", body: JSON.stringify(body) });
    selectedTeamId = team.id;
    localStorage.setItem("collavibe-team", selectedTeamId);
    await load();
  } catch (caught) {
    error.textContent = caught.message;
  }
}

async function submitJoinTeam(event) {
  event.preventDefault();
  const error = elements.joinTeamForm.querySelector("[data-team-error]");
  error.textContent = "";
  try {
    const body = Object.fromEntries(new FormData(elements.joinTeamForm));
    const { team } = await request("/api/teams/join", { method: "POST", body: JSON.stringify(body) });
    selectedTeamId = team.id;
    localStorage.setItem("collavibe-team", selectedTeamId);
    await load();
  } catch (caught) {
    error.textContent = caught.message;
  }
}

async function connectProject(event) {
  event.preventDefault();
  const error = document.querySelector("#project-error");
  error.textContent = "";
  try {
    const repoPath = new FormData(event.currentTarget).get("repoPath");
    await request(`/api/teams/${encodeURIComponent(dashboard.selectedTeam.id)}/projects`, { method: "POST", body: JSON.stringify({ repoPath }) });
    await load();
  } catch (caught) {
    error.textContent = caught.message;
  }
}

async function logOut() {
  await request("/api/auth/logout", { method: "POST" });
  localStorage.removeItem("collavibe-team");
  selectedTeamId = "";
  latestFingerprint = "";
  show("auth");
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
document.querySelectorAll("[data-team-mode]").forEach((button) => button.addEventListener("click", () => setTeamMode(button.dataset.teamMode)));
elements.authForm.addEventListener("submit", submitAuth);
elements.createTeamForm.addEventListener("submit", submitCreateTeam);
elements.joinTeamForm.addEventListener("submit", submitJoinTeam);
elements.refresh.addEventListener("click", () => load());
elements.teamSelect.addEventListener("change", () => { selectedTeamId = elements.teamSelect.value; localStorage.setItem("collavibe-team", selectedTeamId); selectedFeatureId = null; load(); });
elements.copyCode.addEventListener("click", async () => {
  const copied = await copyText(dashboard.selectedTeam.joinCode);
  if (!copied) return;
  const previous = elements.copyCode.querySelector("span").textContent;
  elements.copyCode.querySelector("span").textContent = "Copied";
  setTimeout(() => { elements.copyCode.querySelector("span").textContent = previous; }, 1400);
});
elements.openAgentSetup.addEventListener("click", openAgentSetup);
elements.closeAgentSetup.addEventListener("click", () => elements.agentDialog.close());
elements.agentDialog.addEventListener("click", (event) => {
  if (event.target === elements.agentDialog) elements.agentDialog.close();
});
document.querySelectorAll("[data-agent-platform]").forEach((button) => {
  button.addEventListener("click", () => setAgentPlatform(button.dataset.agentPlatform));
});
document.querySelectorAll("[data-copy-setup]").forEach((button) => {
  button.addEventListener("click", async () => {
    const copied = await copyText(agentSetupValues()[button.dataset.copySetup]);
    elements.setupCopyStatus.textContent = copied ? `${button.textContent.trim().replace(/^Copy /, "")} copied.` : "Could not copy automatically. Select the text above and copy it manually.";
    if (!copied) return;
    const previous = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = previous; }, 1400);
  });
});
elements.accountButton.addEventListener("click", () => { elements.accountMenu.hidden = !elements.accountMenu.hidden; });
elements.addTeam.addEventListener("click", () => {
  elements.accountMenu.hidden = true;
  const repoInput = elements.createTeamForm.elements.repoPath;
  if (!repoInput.value) repoInput.value = dashboard.defaultRepoPath || "";
  setTeamMode("create");
  elements.backWorkspace.hidden = false;
  show("team");
});
elements.backWorkspace.addEventListener("click", () => show("workspace"));
elements.logout.addEventListener("click", logOut);
elements.teamLogout.addEventListener("click", logOut);
document.addEventListener("click", (event) => {
  if (!elements.accountMenu.contains(event.target) && event.target !== elements.accountButton) elements.accountMenu.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.refresh.focus();
  }
});

setAuthMode("signup");
setTeamMode("create");
load();
setInterval(() => { if (!elements.workspace.hidden) load({ quiet: true }); }, 5000);
