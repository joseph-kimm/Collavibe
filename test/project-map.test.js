import { describe, expect, it } from "vitest";
import { buildProjectMap, sessionBranch } from "../public/project-map.js";
import { sampleWorkspace } from "../public/demo.js";
import { readFileSync } from "node:fs";

const feature = (id, owner = "Shayan", extra = {}) => ({ id, projectId: "p1", title: id, owner, status: "active", checklist: [], ...extra });
const session = (id, featureId, participant = "Shayan", extra = {}) => ({ id, projectId: "p1", featureId, participant, startedAt: "2026-10-19T18:00:00Z", status: "synced", startSnapshot: { branch: "main" }, sync: { summary: "Implemented the landing page", verified: { endBranch: "codex/landing", commits: [{ hash: "abc123456" }] } }, ...extra });
const build = (extra = {}) => buildProjectMap({ projectId: "p1", features: [feature("f1")], sessions: [session("s1", "f1")], ...extra });

describe("project map relationships", () => {
  it("connects an actual session to its feature and final branch", () => {
    const result = build();
    expect(result.entries[0].sessions[0].id).toBe("s1");
    expect(result.summary).toEqual({ features: 1, people: 1, sessions: 1, handoffs: 1, commits: 1 });
    expect(sessionBranch(result.entries[0].sessions[0])).toBe("codex/landing");
  });
  it("uses the starting branch only when no final branch exists", () => {
    expect(sessionBranch({ startSnapshot: { branch: "main" } })).toBe("main");
    expect(sessionBranch({ sync: { verified: { endBranch: "feature/new" } } })).toBe("feature/new");
    expect(sessionBranch(null)).toBe("");
  });
  it("shows multiple actual collaborators without inferring completed work from assignment", () => {
    const result = build({ features: [feature("f1"), feature("f2", "Joseph")], sessions: [session("s1", "f1"), session("s2", "f1", "Joseph")] });
    expect(result.people).toEqual(["Joseph", "Shayan"]);
    const joseph = result.groups.find((group) => group.name === "Joseph");
    expect(joseph.entries).toHaveLength(2);
    expect(joseph.sessions).toHaveLength(1);
    expect(result.entries.find((entry) => entry.feature.id === "f2").sessions).toEqual([]);
  });
  it("never leaks another project's features or sessions", () => {
    const result = build({ features: [feature("f1"), feature("private", "Other", { projectId: "p2" })], sessions: [session("s1", "f1"), session("private-session", "f1", "Other", { projectId: "p2" })] });
    expect(result.entries).toHaveLength(1);
    expect(result.people).toEqual(["Shayan"]);
    expect(result.summary.sessions).toBe(1);
  });
  it("filters by people who contributed even when someone else owns the feature", () => {
    const result = build({ person: "Joseph", sessions: [session("s1", "f1", "Joseph")] });
    expect(result.entries).toHaveLength(1);
    expect(result.groups.map((group) => group.name)).toEqual(["Joseph"]);
    expect(build({ person: "Nobody" }).entries).toEqual([]);
  });
  it("searches decisions, branches and handoffs as well as feature titles", () => {
    expect(build({ query: "landing page" }).entries).toHaveLength(1);
    expect(build({ query: "codex/landing" }).entries).toHaveLength(1);
    expect(build({ query: "no matching text" }).entries).toHaveLength(0);
  });
  it("applies status, priority and archive filters together", () => {
    const features = [feature("active", "Shayan", { priority: "high" }), feature("archived", "Shayan", { archivedAt: "2026-10-19", status: "review" })];
    expect(build({ features, priority: "high", status: "active" }).entries.map((item) => item.feature.id)).toEqual(["active"]);
    expect(build({ features, archived: true }).entries.map((item) => item.feature.id)).toEqual(["archived"]);
    expect(build({ features, status: "done" }).entries).toEqual([]);
  });
  it("keeps sessions that are still choosing a feature visible", () => {
    const result = build({ features: [], sessions: [session("choosing", undefined, "Shayan", { status: "choosing", sync: undefined })] });
    expect(result.unlinkedSessions).toHaveLength(1);
    expect(result.groups[0].sessions).toHaveLength(1);
    expect(result.summary.handoffs).toBe(0);
  });
  it("does not count the same commit twice across recorded sessions", () => {
    expect(build({ sessions: [session("s1", "f1"), session("s2", "f1")] }).summary.commits).toBe(1);
  });
  it("keeps unassigned work visible in contributor mode and handles empty projects", () => {
    expect(build({ features: [feature("unassigned", "")], sessions: [] }).groups[0].unassigned).toBe(true);
    expect(build({ features: [], sessions: [] }).summary.features).toBe(0);
    expect(build({ features: [], sessions: [] }).groups).toEqual([]);
  });
  it("does not put hidden archived sessions in the unlinked branch", () => {
    const result = build({ features: [feature("f1", "Shayan", { archivedAt: "2026-10-19" })] });
    expect(result.entries).toEqual([]);
    expect(result.unlinkedSessions).toEqual([]);
  });
  it("keeps multi-contributor demo evidence coherent and explicitly separate", () => {
    const demo = sampleWorkspace();
    const result = buildProjectMap({ projectId: "p1", features: demo.features, sessions: demo.sessions });
    expect(result.summary).toMatchObject({ features: 6, people: 3, handoffs: 4, commits: 4 });
    expect(sessionBranch(demo.sessions.find((item) => item.featureId === "f2"))).toBe("feature/calendar");
    expect(result.groups.find((group) => group.name === "Maya").sessions).toHaveLength(2);
  });
  it("does not reintroduce tiny fixed font sizes in the workspace styles", () => {
    for (const file of ["styles.css", "project-map.css"]) {
      const css = readFileSync(new URL("../public/" + file, import.meta.url), "utf8");
      const fixedSizes = [...css.matchAll(/font(?:-size)?:\s*(\d+)px/g)].map((match) => Number(match[1]));
      expect(fixedSizes.every((size) => size >= 14)).toBe(true);
    }
  });
});
