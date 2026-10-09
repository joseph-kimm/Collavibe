import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { chooseWorkItem, getProjectContext, resetStateForTests, startCollaborationSession, syncCollaborationSession } from "../src/store.js";

const exec = promisify(execFile);
const root = await mkdtemp(path.join(os.tmpdir(), "collavibe-test-"));
const repo = path.join(root, "repo");
process.env.COLLAVIBE_DATA_PATH = path.join(root, "state.json");

async function git(...args: string[]) {
  return exec("git", ["-C", repo, ...args]);
}

beforeEach(async () => {
  await rm(repo, { recursive: true, force: true });
  await exec("mkdir", ["-p", repo]);
  await git("init", "-b", "main");
  await git("config", "user.name", "Test Teammate");
  await git("config", "user.email", "teammate@example.com");
  await writeFile(path.join(repo, "README.md"), "# Demo\n", "utf8");
  await git("add", "README.md");
  await git("commit", "-m", "initial project");
  await resetStateForTests();
});

afterAll(async () => rm(root, { recursive: true, force: true }));

describe("agent-to-team session workflow", () => {
  it("starts with repository context and concrete work choices", async () => {
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    expect(started.project.latestGit.branch).toBe("main");
    expect(started.workOptions.at(-1)?.kind).toBe("new_feature");
    expect(started.agentInstructions.toLowerCase()).toContain("ask the user");
  });

  it("records a selected feature and verifies changed files at sync", async () => {
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    const selected = await chooseWorkItem({
      sessionId: started.session.id,
      intendedBranch: "feature/session-map",
      newFeature: {
        title: "Session map",
        description: "Show teammate coding sessions beside repository branches.",
        checklist: ["Display the current branch", "Show the last synced summary"],
      },
    });
    await writeFile(path.join(repo, "session-map.ts"), "export const sessionMap = true;\n", "utf8");
    const synced = await syncCollaborationSession({
      sessionId: started.session.id,
      summary: "Built the first session-map module and left it ready for review.",
      workCompleted: ["Added session map module"],
      decisions: ["Kept Git verification separate from the agent summary"],
      blockers: [],
      nextSteps: ["Add the browser view"],
      agentReportedFiles: ["session-map.ts", "imaginary.ts"],
      completedChecklistItemIds: [selected.feature.checklist[0].id],
      featureStatus: "review",
    });
    expect(synced.verification.changedFiles).toContain("session-map.ts");
    expect(synced.verification.reportedButUnverified).toEqual(["imaginary.ts"]);
    expect(synced.feature?.checklist[0].done).toBe(true);
  });

  it("will not mark work done without verified changes and a complete checklist", async () => {
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    await chooseWorkItem({
      sessionId: started.session.id,
      newFeature: { title: "Project tree", description: "Render the repository feature tree.", checklist: ["Tree is visible"] },
    });
    await expect(syncCollaborationSession({
      sessionId: started.session.id,
      summary: "No implementation was completed in this session.",
      workCompleted: [], decisions: [], blockers: [], nextSteps: ["Implement the tree"], agentReportedFiles: [], featureStatus: "done",
    })).rejects.toThrow("Done requires");
  });

  it("refreshes the same project instead of duplicating it", async () => {
    await getProjectContext(repo);
    const refreshed = await getProjectContext(repo);
    expect(refreshed.project.name).toBe("repo");
    expect(refreshed.sessions).toHaveLength(0);
  });
});
