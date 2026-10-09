import { execFile } from "node:child_process";
import { access, mkdtemp, rename, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inspectRepository } from "../src/git.js";
import { chooseWorkItem, getProjectContext, readState, resetStateForTests, startCollaborationSession, syncCollaborationSession } from "../src/store.js";

const exec = promisify(execFile);
const root = await mkdtemp(path.join(os.tmpdir(), "collavibe-test-"));
const repo = path.join(root, "repo");
const remoteRepo = path.join(root, "remote.git");
process.env.COLLAVIBE_DATA_PATH = path.join(root, "state.json");

async function git(...args: string[]) {
  return exec("git", ["-C", repo, ...args]);
}

beforeEach(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(remoteRepo, { recursive: true, force: true });
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
  it("preserves the complete filename for the first modified tracked file", async () => {
    await writeFile(path.join(repo, "README.md"), "# Updated demo\n", "utf8");
    const snapshot = await inspectRepository(repo);
    expect(snapshot.workingFiles).toEqual(["README.md"]);
  });

  it("removes credentials from repository remotes before storing context", async () => {
    await git("remote", "add", "origin", "https://secret-user:secret-password@example.com/team/repo.git");
    const snapshot = await inspectRepository(repo);
    expect(snapshot.remote).toBe("https://example.com/team/repo.git");
    expect(JSON.stringify(snapshot)).not.toContain("secret-password");
  });

  it("starts with repository context and concrete work choices", async () => {
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    expect(started.project.latestGit.branch).toBe("main");
    expect(started.workOptions.at(-1)?.kind).toBe("new_feature");
    expect(started.agentInstructions.toLowerCase()).toContain("ask the user");
  });

  it("does not offer remote-tracking refs as duplicate branch choices", async () => {
    await exec("git", ["init", "--bare", remoteRepo]);
    await git("remote", "add", "origin", remoteRepo);
    await git("push", "-u", "origin", "main");
    await git("branch", "teammate-work");
    await git("push", "origin", "teammate-work");
    await git("branch", "-D", "teammate-work");
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    expect(started.project.latestGit.branches.some((branch) => branch.name === "origin/teammate-work")).toBe(true);
    expect(started.workOptions.some((option) => option.branch === "origin/teammate-work")).toBe(false);
  });

  it("recovers a stale inter-process lock without leaving a lock behind", async () => {
    const lockPath = `${process.env.COLLAVIBE_DATA_PATH!}.lock`;
    await writeFile(lockPath, "abandoned-owner", "utf8");
    const old = new Date(Date.now() - 60_000);
    await utimes(lockPath, old, old);
    await getProjectContext(repo);
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
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

  it("does not attribute an unchanged pre-existing dirty file to the session", async () => {
    await writeFile(path.join(repo, "README.md"), "# Dirty before start\n", "utf8");
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    await chooseWorkItem({
      sessionId: started.session.id,
      newFeature: { title: "No-op audit", description: "Inspect existing work without changing it.", checklist: ["Review prior work"] },
    });
    const synced = await syncCollaborationSession({
      sessionId: started.session.id,
      summary: "Reviewed the existing working tree without changing its files.",
      workCompleted: ["Reviewed existing work"], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: ["README.md"], featureStatus: "review",
    });
    expect(synced.verification.changedFiles).toEqual([]);
    expect(synced.verification.reportedButUnverified).toEqual(["README.md"]);
  });

  it("detects when a pre-existing dirty file changes during the session", async () => {
    await writeFile(path.join(repo, "README.md"), "# Dirty before start\n", "utf8");
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    await chooseWorkItem({
      sessionId: started.session.id,
      newFeature: { title: "Readme update", description: "Revise the existing project documentation.", checklist: ["Update readme"] },
    });
    await writeFile(path.join(repo, "README.md"), "# Changed during session\n", "utf8");
    const synced = await syncCollaborationSession({
      sessionId: started.session.id,
      summary: "Changed the pre-existing README modification during this session.",
      workCompleted: ["Updated readme"], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: ["README.md"], featureStatus: "review",
    });
    expect(synced.verification.changedFiles).toEqual(["README.md"]);
    expect(synced.verification.reportedButUnverified).toEqual([]);
  });

  it("verifies only commits created after the session starts", async () => {
    await git("switch", "-c", "existing-work");
    await writeFile(path.join(repo, "existing.ts"), "export const existing = true;\n", "utf8");
    await git("add", "existing.ts");
    await git("commit", "-m", "existing teammate work");
    await git("switch", "main");

    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    const selected = await chooseWorkItem({
      sessionId: started.session.id,
      intendedBranch: "existing-work",
      newFeature: { title: "Continue feature", description: "Continue work on an existing teammate branch.", checklist: ["Add current session change"] },
    });
    await git("switch", "existing-work");
    await writeFile(path.join(repo, "new.ts"), "export const addedNow = true;\n", "utf8");
    await git("add", "new.ts");
    await git("commit", "-m", "new session work");
    const synced = await syncCollaborationSession({
      sessionId: started.session.id,
      summary: "Added and committed one file after continuing the existing branch.",
      workCompleted: ["Added current session change"], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: ["new.ts"],
      completedChecklistItemIds: selected.feature.checklist.map((item) => item.id), featureStatus: "done",
    });
    expect(synced.verification.commits.map((commit) => commit.subject)).toEqual(["new session work"]);
    expect(synced.verification.changedFiles).toEqual(["new.ts"]);
    expect(synced.verification.startBranch).toBe("main");
    expect(synced.verification.endBranch).toBe("existing-work");
  });

  it("does not treat switching to an existing branch as newly completed work", async () => {
    await git("switch", "-c", "existing-work");
    await writeFile(path.join(repo, "existing.ts"), "export const existing = true;\n", "utf8");
    await git("add", "existing.ts");
    await git("commit", "-m", "existing teammate work");
    await git("switch", "main");
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    await chooseWorkItem({
      sessionId: started.session.id,
      intendedBranch: "existing-work",
      newFeature: { title: "Inspect branch", description: "Inspect a teammate branch before making changes.", checklist: ["Inspect branch"] },
    });
    await git("switch", "existing-work");
    const synced = await syncCollaborationSession({
      sessionId: started.session.id,
      summary: "Switched to the existing branch and inspected it without editing files.",
      workCompleted: ["Inspected branch"], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: ["existing.ts"], featureStatus: "review",
    });
    expect(synced.verification.commits).toEqual([]);
    expect(synced.verification.changedFiles).toEqual([]);
    expect(synced.verification.reportedButUnverified).toEqual(["existing.ts"]);
  });

  it("tracks both sides of a rename without parsing arrow-like text", async () => {
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    await chooseWorkItem({
      sessionId: started.session.id,
      newFeature: { title: "Rename docs", description: "Rename the project documentation file.", checklist: ["Rename the file"] },
    });
    await rename(path.join(repo, "README.md"), path.join(repo, "README -> Guide.md"));
    const snapshot = await inspectRepository(repo);
    expect(snapshot.workingFiles).toEqual(["README -> Guide.md", "README.md"]);
    const synced = await syncCollaborationSession({
      sessionId: started.session.id,
      summary: "Renamed the documentation file to its new human-readable name.",
      workCompleted: ["Renamed docs"], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: ["README -> Guide.md"], featureStatus: "review",
    });
    expect(synced.verification.changedFiles).toEqual(["README -> Guide.md", "README.md"]);
    expect(synced.verification.reportedButUnverified).toEqual([]);
  });

  it("preserves newline characters in Git filenames", async () => {
    const unusualName = "line\nbreak.ts";
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    await chooseWorkItem({
      sessionId: started.session.id,
      newFeature: { title: "Odd filename", description: "Verify Git paths are parsed without newline delimiters.", checklist: ["Track exact path"] },
    });
    await writeFile(path.join(repo, unusualName), "export const unusual = true;\n", "utf8");
    const snapshot = await inspectRepository(repo);
    expect(snapshot.workingFiles).toEqual([unusualName]);
    const synced = await syncCollaborationSession({
      sessionId: started.session.id,
      summary: "Verified that a filename containing a newline remains one exact path.",
      workCompleted: ["Tracked unusual filename"], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: [unusualName], featureStatus: "review",
    });
    expect(synced.verification.changedFiles).toEqual([unusualName]);
    expect(synced.verification.reportedButUnverified).toEqual([]);
  });

  it("rejects ambiguous selections and terminal session transitions", async () => {
    const setup = await startCollaborationSession({ repoPath: repo, participant: "Amina" });
    const first = await chooseWorkItem({
      sessionId: setup.session.id,
      newFeature: { title: "First feature", description: "Create a first concrete test feature.", checklist: ["Make a change"] },
    });
    const started = await startCollaborationSession({ repoPath: repo, participant: "Shayan" });
    await expect(chooseWorkItem({
      sessionId: started.session.id,
      featureId: first.feature.id,
      newFeature: { title: "Second feature", description: "This ambiguous choice must be rejected.", checklist: ["Do not accept"] },
    })).rejects.toThrow("exactly one");
    await chooseWorkItem({ sessionId: started.session.id, featureId: first.feature.id });
    await expect(chooseWorkItem({ sessionId: started.session.id, featureId: first.feature.id })).rejects.toThrow("already has selected work");
    await writeFile(path.join(repo, "change.ts"), "export const changed = true;\n", "utf8");
    const payload = {
      sessionId: started.session.id,
      summary: "Made one test change and synchronized the active session.",
      workCompleted: ["Made test change"], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: ["change.ts"], featureStatus: "review" as const,
    };
    await syncCollaborationSession(payload);
    await expect(syncCollaborationSession(payload)).rejects.toThrow("already been synced");
    await expect(chooseWorkItem({ sessionId: started.session.id, featureId: first.feature.id })).rejects.toThrow("already been synced");
  });

  it("preserves sessions written concurrently by separate MCP processes", async () => {
    const helper = path.join(process.cwd(), "test/helpers/start-session.ts");
    const tsx = path.join(process.cwd(), "node_modules/.bin/tsx");
    await Promise.all(["Amina", "Joseph", "Shayan", "Taylor"].map((participant) => exec(tsx, [helper, repo, participant], {
      env: { ...process.env, COLLAVIBE_DATA_PATH: process.env.COLLAVIBE_DATA_PATH! },
    })));
    const state = await readState();
    expect(state.sessions.map((session) => session.participant).sort()).toEqual(["Amina", "Joseph", "Shayan", "Taylor"]);
  }, 20_000);

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
