const elements = {
  projectName: document.querySelector("#project-name"),
  projectMeta: document.querySelector("#project-meta"),
  projectTree: document.querySelector("#project-tree"),
  activity: document.querySelector("#activity"),
  detail: document.querySelector("#detail"),
  selectionStatus: document.querySelector("#selection-status"),
  currentBranch: document.querySelector("#current-branch"),
  currentHead: document.querySelector("#current-head"),
  refresh: document.querySelector("#refresh"),
  connectionLabel: document.querySelector("#connection-label"),
};

let state = { projects: [], features: [], sessions: [] };
let selectedFeatureId = null;
let latestFingerprint = "";
let loadSequence = 0;

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const shortDate = (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

async function load({ quiet = false } = {}) {
  const sequence = ++loadSequence;
  if (!quiet) {
    elements.refresh.disabled = true;
    elements.refresh.textContent = "Refreshing…";
  }
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load project state");
    const nextState = await response.json();
    if (sequence !== loadSequence) return;
    const fingerprint = JSON.stringify(nextState);
    if (fingerprint !== latestFingerprint) {
      state = nextState;
      latestFingerprint = fingerprint;
      render();
    }
    elements.connectionLabel.textContent = `Connected · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch (error) {
    elements.connectionLabel.textContent = error.message;
  } finally {
    if (!quiet) {
      elements.refresh.disabled = false;
      elements.refresh.textContent = "Refresh context";
    }
  }
}

function render() {
  const project = state.projects.at(-1);
  if (!project) {
    renderEmpty();
    return;
  }
  const features = state.features.filter((feature) => feature.projectId === project.id);
  const sessions = state.sessions.filter((session) => session.projectId === project.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!selectedFeatureId || !features.some((feature) => feature.id === selectedFeatureId)) selectedFeatureId = features[0]?.id || null;

  elements.projectName.textContent = project.name;
  elements.projectMeta.textContent = `${features.length} feature${features.length === 1 ? "" : "s"} · ${sessions.length} recorded session${sessions.length === 1 ? "" : "s"}`;
  elements.currentBranch.textContent = project.latestGit.branch;
  elements.currentHead.textContent = project.latestGit.head.slice(0, 7);
  renderTree(project, features);
  renderActivity(features, sessions);
  renderDetail(features.find((feature) => feature.id === selectedFeatureId), sessions);
}

function renderEmpty() {
  elements.projectTree.innerHTML = "";
  elements.activity.replaceChildren(document.querySelector("#empty-activity").content.cloneNode(true));
  elements.detail.innerHTML = '<p class="placeholder-detail">Choose a feature after the first MCP session starts. Its owner, branch, description, checklist, and latest verified sync will appear here.</p>';
}

function renderTree(project, features) {
  const branches = project.latestGit.branches;
  elements.projectTree.innerHTML = `<div class="tree-root">
    <div class="root-label"><span class="root-dot"></span><span>${escapeHtml(project.name)}</span><code>${project.latestGit.head.slice(0, 7)}</code></div>
    ${branches.map((branch) => {
      const branchFeatures = features.filter((feature) => feature.branch === branch.name || (!feature.branch && branch.current));
      return `<div class="branch-group">
        <div class="branch-label"><strong>${branch.current ? "● " : ""}${escapeHtml(branch.name)}</strong><code>${escapeHtml(branch.head)}</code></div>
        <div class="feature-nodes">${branchFeatures.length ? branchFeatures.map((feature) => `<button class="tree-node ${feature.status} ${feature.id === selectedFeatureId ? "selected" : ""}" type="button" data-feature-id="${feature.id}" aria-pressed="${feature.id === selectedFeatureId}"><span>${escapeHtml(feature.title)}</span></button>`).join("") : '<span class="tree-node"><span>No recorded feature</span></span>'}</div>
      </div>`;
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
    const sync = session.sync;
    const verified = sync?.verified;
    return `<article class="session-entry ${session.status}" style="--delay:${index * 45}ms">
      <div class="session-meta"><strong>${escapeHtml(session.participant)}</strong><span>${shortDate(session.startedAt)}</span><span>${escapeHtml(session.startSnapshot.branch)}</span><span class="session-state">${escapeHtml(session.status)}</span></div>
      <h3>${escapeHtml(feature?.title || session.intent || "Choosing work")}</h3>
      <p class="session-summary">${escapeHtml(sync?.summary || "Session started. Waiting for the agent to sync its handoff.")}</p>
      ${verified ? `<div class="verified-row">
        <span class="verified-chip"><strong>${verified.commits.length}</strong> verified commits</span>
        <span class="verified-chip"><strong>${verified.changedFiles.length}</strong> changed files</span>
        ${verified.reportedButUnverified.length ? `<span class="verified-chip unverified"><strong>${verified.reportedButUnverified.length}</strong> unverified claims</span>` : ""}
      </div>` : ""}
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
  elements.selectionStatus.textContent = feature.status;
  elements.selectionStatus.className = `status ${feature.status}`;
  elements.detail.innerHTML = `
    <h3>${escapeHtml(feature.title)}</h3>
    <p class="detail-description">${escapeHtml(feature.description)}</p>
    <div class="detail-block detail-grid"><div><span>Owner</span><strong>${escapeHtml(feature.owner || "Unclaimed")}</strong></div><div><span>Branch</span><strong>${escapeHtml(feature.branch || "Not set")}</strong></div></div>
    <div class="detail-block"><h4>Completion checklist</h4><ul class="checklist">${feature.checklist.map((item) => `<li class="${item.done ? "done" : ""}"><span class="checkmark" aria-hidden="true">${item.done ? "✓" : ""}</span><span><span class="sr-only">${item.done ? "Completed" : "Incomplete"}: </span>${escapeHtml(item.text)}</span></li>`).join("")}</ul></div>
    <div class="detail-block"><h4>Last verified delta</h4>${verified ? `<ul class="files">${verified.changedFiles.map((file) => `<li>${escapeHtml(file)}</li>`).join("") || "<li>No changed files</li>"}</ul>` : '<p class="placeholder-detail">No completed sync for this feature yet.</p>'}</div>
  `;
}

elements.refresh.addEventListener("click", () => load());
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.refresh.focus();
  }
});

load();
setInterval(() => load({ quiet: true }), 5000);
