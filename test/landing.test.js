import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { workflowSteps, initializeLanding } from "../public/landing.js";
import { icon } from "../public/icons.js";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function fixture(options = {}) {
  const element = (dataset = {}) => ({ dataset, hidden: false, textContent: "", attributes: {}, events: {}, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, fn) { this.events[key] = fn; }, scrollIntoView: vi.fn(), focus: vi.fn(), animate: vi.fn() });
  const ids = Object.fromEntries(["auth-context", "account", "workflow-panel", "workflow-panel-title", "workflow-prompt", "workflow-result-title", "workflow-result-description", "workflow-boundary", "copy-workflow-prompt"].map(id => [id, element()]));
  ids["auth-form"] = { elements: { name: element(), email: element() } };
  const steps = Object.keys(workflowSteps).map(key => element({ workflowStep: key }));
  const account = [element({ openAccount: "login" }), element({ openAccount: "signup" })];
  vi.stubGlobal("document", { getElementById: id => ids[id], querySelectorAll: selector => selector === "[data-open-account]" ? account : steps });
  vi.stubGlobal("matchMedia", () => ({ matches: !!options.reducedMotion }));
  const setAuthMode = vi.fn(), copy = vi.fn().mockResolvedValue(undefined);
  initializeLanding({ setAuthMode, copy, ...options });
  return { ids, steps, account, setAuthMode, copy };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("public homepage", () => {
  it("has no sample-workspace entry and keeps working account and workflow targets", () => {
    expect(html).not.toContain('id="view-demo"');
    expect(html).not.toContain("View a sample workspace");
    for (const id of ["account", "how-it-works", "auth-form", "name-field", "password-hint", "auth-error"]) expect(html).toContain(`id="${id}"`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("uses all three workflow stages without promising autonomous commits or GitHub monitoring", () => {
    expect(Object.keys(workflowSteps)).toEqual(["start", "build", "sync"]);
    expect(workflowSteps.start.prompt).toContain("Wait for me to choose");
    expect(workflowSteps.build.prompt).toContain("Do not commit or push unless I ask");
    expect(workflowSteps.sync.prompt).toContain("Do not commit or push");
    expect(html).toContain("does not automatically read your whole chat");
    expect(html).toContain("or watch GitHub pushes");
  });
  it("switches every workflow field, keeps focus in place, and copies the selected prompt", async () => {
    const { steps, ids, copy } = fixture();
    steps[2].events.click();
    expect(steps.map(step => step.attributes["aria-pressed"])).toEqual(["false", "false", "true"]);
    expect(ids["workflow-panel-title"].textContent).toBe(workflowSteps.sync.title);
    expect(ids["workflow-prompt"].textContent).toBe(workflowSteps.sync.prompt);
    expect(ids["workflow-result-title"].textContent).toBe(workflowSteps.sync.result);
    expect(ids["workflow-result-description"].textContent).toBe(workflowSteps.sync.description);
    expect(ids["workflow-boundary"].textContent).toBe(workflowSteps.sync.boundary);
    expect(ids["workflow-panel"].focus).not.toHaveBeenCalled();
    await ids["copy-workflow-prompt"].events.click();
    expect(copy).toHaveBeenCalledWith(workflowSteps.sync.prompt);
  });
  it("opens the correct real account mode and focuses the first field", () => {
    const { account, ids, setAuthMode } = fixture();
    account[1].events.click();
    expect(setAuthMode).toHaveBeenLastCalledWith("signup");
    expect(ids["auth-form"].elements.name.focus).toHaveBeenCalled();
    account[0].events.click();
    expect(setAuthMode).toHaveBeenLastCalledWith("login");
    expect(ids["auth-form"].elements.email.focus).toHaveBeenCalled();
    expect(ids.account.scrollIntoView).toHaveBeenCalledTimes(2);
  });
  it("preserves invitation and agent authorization context without displaying their raw tokens", () => {
    const { ids } = fixture({ invitation: "PRIVATE-CODE" });
    expect(ids["auth-context"].hidden).toBe(false);
    expect(ids["auth-context"].textContent).toContain("join the team");
    expect(ids["auth-context"].textContent).not.toContain("PRIVATE-CODE");
    const oauth = fixture({ authorizationId: "PRIVATE-AUTHORIZATION" });
    expect(oauth.ids["auth-context"].textContent).toContain("authorize your coding agent");
    expect(oauth.ids["auth-context"].textContent).not.toContain("PRIVATE-AUTHORIZATION");
  });
  it("respects reduced motion", () => {
    const { steps, ids } = fixture({ reducedMotion: true });
    steps[1].events.click();
    expect(ids["workflow-panel"].animate).not.toHaveBeenCalled();
  });
  it("gives a usable manual fallback when copying is denied", async () => {
    const copy = vi.fn().mockRejectedValue(new Error("Denied"));
    const { ids } = fixture({ copy });
    ids["copy-workflow-prompt"].events.click();
    await Promise.resolve();
    expect(ids["workflow-boundary"].textContent).toContain("copy it manually");
  });
  it("serves accessible decorative SVGs only from an explicit icon allowlist", () => {
    expect(icon("git-branch")).toContain('aria-hidden="true"');
    expect(icon("x")).toContain('focusable="false"');
    expect(icon('<script>alert(1)</script>')).toBe("");
    expect(icon("__proto__")).toBe("");
    for (const match of html.matchAll(/data-icon="([^"]+)"/g)) expect(icon(match[1])).toContain("<svg");
  });
});
