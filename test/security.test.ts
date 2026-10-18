import { describe, expect, it } from "vitest";
import { consumeLocalLimit } from "../server/request-limits.js";
import { newSecret, secretHash } from "../src/agent-access.js";
import { makeProject } from "../src/workspace-model.js";

describe("public access boundaries", () => {
  it("creates unpredictable opaque keys and one-way fingerprints", () => {
    const keys = Array.from({ length: 100 }, () => newSecret());
    expect(new Set(keys).size).toBe(100);
    expect(keys.every((key) => /^cv_[A-Za-z0-9_-]{43}$/.test(key))).toBe(true);
    expect(secretHash(keys[0])).toMatch(/^[a-f0-9]{64}$/);
    expect(secretHash(keys[0])).not.toContain(keys[0]);
  });
  it("limits a caller without blocking another and expires the bucket", () => {
    expect(consumeLocalLimit("one", 2, 60, 1000)).toBe(true);
    expect(consumeLocalLimit("one", 2, 60, 1001)).toBe(true);
    expect(consumeLocalLimit("one", 2, 60, 1002)).toBe(false);
    expect(consumeLocalLimit("two", 2, 60, 1002)).toBe(true);
    expect(consumeLocalLimit("one", 2, 60, 61001)).toBe(true);
  });
  it("isolates the same repository across independent teams", () => {
    const repo = { name: "Shared public repository", repositoryUrl: "https://github.com/example/project" };
    expect(makeProject(repo, "team-a").id).not.toBe(makeProject(repo, "team-b").id);
    expect(makeProject(repo, "team-a").id).toBe(makeProject({ ...repo, repositoryUrl: repo.repositoryUrl + ".git/" }, "team-a").id);
  });
});
