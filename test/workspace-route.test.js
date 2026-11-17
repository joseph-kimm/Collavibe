import { describe, expect, it } from "vitest";
import { readWorkspaceRoute, hasWorkspaceRoute, bindWorkspaceNavigation, writeWorkspaceUrl } from "../public/workspace-route.js";

describe("workspace routes", () => {
  it("records explicit navigation without adding entries on refresh or repeated clicks", () => {
    const entries = ["/#team=t&project=p&view=map"], target = {location:{pathname:"/",search:"",hash:"#team=t&project=p&view=map"},history:{}};
    const move = url => { target.location.hash = new URL(url, "https://example.test").hash; };
    target.history.pushState = (_, __, url) => { entries.push(url); move(url); };
    target.history.replaceState = (_, __, url) => { entries[entries.length-1] = url; move(url); };
    const sessionUrl = "/#team=t&project=p&view=map&session=s";
    writeWorkspaceUrl(target, sessionUrl, true);
    writeWorkspaceUrl(target, sessionUrl);
    writeWorkspaceUrl(target, sessionUrl, true);
    writeWorkspaceUrl(target, "/#team=t&project=p&view=map&feature=f", true);
    expect(entries).toHaveLength(3);
    expect(readWorkspaceRoute(new URL(entries[1], "https://example.test").hash).selection).toEqual({kind:"session",id:"s"});
    expect(readWorkspaceRoute(new URL(entries[0], "https://example.test").hash).selection).toBeNull();
  });
  it("restores explicit team/project/portfolio ahead of another tab's saved selection", () => {
    expect(readWorkspaceRoute("#team=papi&project=study-sprint&view=portfolio", { teamId: "course-team", projectId: "pantry-pair" })).toEqual({ teamId: "papi", projectId: "study-sprint", view: "portfolio", selection: null });
  });
  it("uses saved workspace selection only for a bare link", () => {
    expect(readWorkspaceRoute("", { teamId: "papi", projectId: "study-sprint" })).toEqual({ teamId: "papi", projectId: "study-sprint", view: "map", selection: null });
    expect(hasWorkspaceRoute("#account")).toBe(false);
    expect(hasWorkspaceRoute("#workflow")).toBe(false);
  });
  it("preserves selected feature or session and validates the view", () => {
    expect(readWorkspaceRoute("#project=p&view=work&feature=f")).toMatchObject({ view: "work", selection: { kind: "feature", id: "f" } });
    expect(readWorkspaceRoute("#project=p&view=map&session=s")).toMatchObject({ view: "map", selection: { kind: "session", id: "s" } });
    expect(readWorkspaceRoute("#project=p&view=portfolio&session=s")).toMatchObject({ view: "sessions", selection: { kind: "session", id: "s" } });
    expect(readWorkspaceRoute("#view=unknown").view).toBe("map");
  });
  it("restores same-document navigation instead of leaving the previous project active", () => {
    const tab = new EventTarget();
    tab.location = { hash: "#team=papi&project=pantry-pair&view=map" };
    let active = readWorkspaceRoute(tab.location.hash);
    const stop = bindWorkspaceNavigation(tab, route => { active = route; }, () => ({ teamId: "other-course", projectId: "pantry-pair" }));
    tab.location.hash = "#team=papi&project=study-sprint&view=portfolio";
    tab.dispatchEvent(new Event("hashchange"));
    expect(active).toMatchObject({ teamId: "papi", projectId: "study-sprint", view: "portfolio" });
    // Refresh parses the same explicit URL even if another tab changed storage.
    expect(readWorkspaceRoute(tab.location.hash, { teamId: "other-course", projectId: "pantry-pair" })).toEqual(active);
    tab.location.hash = "#account";
    tab.dispatchEvent(new Event("hashchange"));
    expect(active.projectId).toBe("study-sprint");
    stop();
    tab.location.hash = "#project=ignored";
    tab.dispatchEvent(new Event("hashchange"));
    expect(active.projectId).toBe("study-sprint");
  });
});
