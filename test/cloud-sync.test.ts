import { afterEach, describe, expect, it, vi } from "vitest";
import { publishCloudState } from "../src/cloud-sync.js";
import { withoutInternalGitEvidence } from "../src/public.js";
import type { Project } from "../src/types.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.COLLAVIBE_CLOUD_URL;
});

describe("hosted coordination boundary", () => {
  it("publishes redacted local state to the hosted agent endpoint", async () => {
    process.env.COLLAVIBE_CLOUD_URL = "https://collavibe.example/";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ synced: { projectId: "project_test" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const project = {
      id: "project_test", name: "demo", root: "/tmp/demo", createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z",
      latestGit: { root: "/tmp/demo", branch: "main", head: "abc", dirty: false, workingFiles: [], workingFileFingerprints: { "secret.ts": "internal" }, branches: [], recentCommits: [], trackedFiles: [], capturedAt: "2026-10-09T00:00:00.000Z" },
    } satisfies Project;
    const result = await publishCloudState({ teamCode: "ABCDEFGH", project, features: [], sessions: [] });
    expect(result.published).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://collavibe.example/api/agent/sync");
    expect(fetchMock.mock.calls[0][1].body).not.toContain("workingFileFingerprints");
    expect(fetchMock.mock.calls[0][1].body).toContain('"teamCode":"ABCDEFGH"');
  });

  it("removes team capabilities and internal fingerprints from public responses", () => {
    expect(withoutInternalGitEvidence({ teamCode: "ABCDEFGH", workingFileFingerprints: { file: "hash" }, safe: true })).toEqual({ safe: true });
  });
});
