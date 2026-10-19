import { describe, expect, it } from "vitest";
import { repositoryPresentation } from "../public/repository-ui.js";

const project = { remote: "https://github.com/shayanahmad7/collavibe-test.git", latestGit: { head: "", branches: [], trackedFiles: [] } };

describe("repository orientation", () => {
  it("shows the repository identity without claiming a provider sync", () => {
    const result = repositoryPresentation(project);
    expect(result.name).toBe("shayanahmad7/collavibe-test");
    expect(result.url).toBe("https://github.com/shayanahmad7/collavibe-test");
    expect(result.provider).toBe("GitHub");
    expect(result.label).toBe("Linked repository");
    expect(result.hasSnapshot).toBe(false);
    expect(result.status).toBe("Waiting for agent snapshot");
    expect(result.description).toContain("Pushes are not imported automatically");
    expect(result.capturedAt).toBe("");
  });

  it("distinguishes an agent snapshot from a live provider connection", () => {
    const result = repositoryPresentation({ ...project, latestGit: { head: "abcd", branch: "feature/test", capturedAt: "2026-10-19T18:00:00Z" } });
    expect(result.hasSnapshot).toBe(true);
    expect(result.status).toBe("Agent snapshot available");
    expect(result.branch).toBe("feature/test");
    expect(result.capturedAt).toBe("2026-10-19T18:00:00Z");
    expect(result.description).toContain("not a live");
  });

  it("does not present an unsnapshotted timestamp as Git evidence", () => {
    const result = repositoryPresentation({ ...project, latestGit: { head: "", branch: "", capturedAt: "2026-10-19T18:00:00Z" } });
    expect(result.hasSnapshot).toBe(false);
    expect(result.capturedAt).toBe("");
  });

  it("marks fictional repositories explicitly", () => {
    const result = repositoryPresentation(project, true);
    expect(result.label).toBe("Sample repository");
    expect(result.status).toBe("Sample data");
    expect(result.description).toContain("not your repository");
  });

  it("accepts SSH identities and missing optional snapshot data", () => {
    const result = repositoryPresentation({ root: "git@gitlab.com:team/subgroup/repository.git" });
    expect(result.name).toBe("team/subgroup/repository");
    expect(result.provider).toBe("GitLab");
    expect(result.hasSnapshot).toBe(false);
  });

  it("keeps other Git providers usable", () => {
    expect(repositoryPresentation({ remote: "https://bitbucket.org/team/repo/" }).provider).toBe("Bitbucket");
    expect(repositoryPresentation({ remote: "https://git.example.org/team/repo" }).provider).toBe("git.example.org");
  });

  it("does not expose credentials or unsafe links", () => {
    for (const remote of ["javascript:alert(1)", "http://github.com/team/repo", "https://secret:password@github.com/team/repo", "https://github.com/team/repo?token=secret", "https://github.com/team/repo#token=secret", "/private/local/checkout"]) {
      expect(repositoryPresentation({ remote })).toBe(null);
    }
    expect(repositoryPresentation(null)).toBe(null);
  });
});
