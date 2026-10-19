export const workflowSteps = Object.freeze({
  start: {
    title: "Start with the team’s context",
    prompt: "Use Collavibe to start a session for this repository. Read the recent handoffs and show me what I could work on. Wait for me to choose.",
    result: "Your agent brings back the plan",
    description: "Recent sessions, feature status, and possible next tasks, before you choose what to build.",
    boundary: "Your agent inspects the repository. Collavibe supplies the shared project context.",
  },
  build: {
    title: "Claim a feature, then build",
    prompt: "I’ve chosen a feature. Claim it through Collavibe, explain the plan, and help me build it here. Do not commit or push unless I ask.",
    result: "Your team can see what you’re working on",
    description: "The feature has an owner and an active session. The code work stays in your coding agent and repository.",
    boundary: "Collavibe coordinates the work. Your agent edits, runs tests, and follows your instructions for Git.",
  },
  sync: {
    title: "Give the next person a place to start",
    prompt: "Use Collavibe to prepare and save a handoff for this session. Summarize the changes, decisions, tests, blockers, and next steps, and include a sanitized Git snapshot. Do not commit or push.",
    result: "The shared map gains your handoff",
    description: "Teammates can open the session, see the recorded branch and changes, and pick up the next task from their own agent.",
    boundary: "Handoffs and Git snapshots come from your agent. Saving one is not a GitHub push or an independent code verification.",
  },
});

export function initializeLanding({ setAuthMode, copy, invitation = "", authorizationId = "" }) {
  let selected = "start";
  const byId = (id) => document.getElementById(id);
  const context = byId("auth-context");
  context.hidden = !invitation && !authorizationId;
  context.textContent = authorizationId ? "Log in or create an account to authorize your coding agent. You’ll choose the team it can access next." : invitation ? "Log in or create an account to join the team using your invitation." : "";
  document.querySelectorAll("[data-open-account]").forEach((button) => button.addEventListener("click", () => {
    setAuthMode(button.dataset.openAccount);
    byId("account").scrollIntoView({ behavior: "auto", block: "start" });
    const field = byId("auth-form").elements[button.dataset.openAccount === "signup" ? "name" : "email"];
    field.focus({ preventScroll: true });
  }));
  document.querySelectorAll("[data-workflow-step]").forEach((button) => button.addEventListener("click", () => {
    if (!Object.hasOwn(workflowSteps, button.dataset.workflowStep)) return;
    selected = button.dataset.workflowStep;
    const step = workflowSteps[selected];
    document.querySelectorAll("[data-workflow-step]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    byId("workflow-panel-title").textContent = step.title;
    byId("workflow-prompt").textContent = step.prompt;
    byId("workflow-result-title").textContent = step.result;
    byId("workflow-result-description").textContent = step.description;
    byId("workflow-boundary").textContent = step.boundary;
    // Replay a short content transition without moving keyboard focus.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) byId("workflow-panel").animate([{ opacity: .55, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, easing: "ease-out" });
  }));
  byId("copy-workflow-prompt").addEventListener("click", () => copy(workflowSteps[selected].prompt).catch(() => {
    byId("workflow-boundary").textContent = "Could not copy automatically. Select the example prompt above and copy it manually.";
  }));
}
