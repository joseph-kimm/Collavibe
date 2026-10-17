import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addRemoteProject, createPlannedFeature, createTeam, getDashboard, joinTeam, listTeamMembers, removeTeamMember, rotateTeamCode, signUpUser, updatePlannedFeature, updateTeamName } from "../src/store.js";
import { editFeature, featureFields, makeFeature, repositoryKey } from "../src/workspace-model.js";

const directory = await mkdtemp(path.join(os.tmpdir(), "collavibe-workspace-test-"));
process.env.COLLAVIBE_DATA_PATH = path.join(directory, "state.json");
afterAll(() => rm(directory, { recursive: true, force: true }));
let ownerId: string;
let memberId: string;
let outsiderId: string;
let teamId: string;
let projectId: string;
let originalCode: string;

beforeAll(async () => {
  const account = async (name: string) => (await signUpUser({ name, email: name + "@example.com", password: "workspace-test-password" })).user.id;
  ownerId = await account("Owner"); memberId = await account("Member"); outsiderId = await account("Outsider");
  const team = await createTeam({ userId: ownerId, name: "Workspace test" });
  teamId = team.id; originalCode = team.joinCode;
  await joinTeam({ userId: memberId, joinCode: originalCode });
});

describe("workspace authorization and planning", () => {
  it("canonicalizes repository identities and rejects credential-bearing URLs", () => {
    expect(repositoryKey("https://github.com/team/repo/")).toBe("https://github.com/team/repo.git");
    expect(repositoryKey("git@github.com:team/repo.git")).toBe("https://github.com/team/repo.git");
    for (const url of ["javascript:alert(1)", "https://secret:password@github.com/team/repo", "https://github.com/team/repo?token=secret"]) expect(() => repositoryKey(url)).toThrow();
  });

  it("adds a project without inventing Git history and scopes it to its team", async () => {
    const project = await addRemoteProject(ownerId, teamId, { name: "Course website", repositoryUrl: "https://github.com/team/course-website" });
    projectId = project.id;
    expect(project.latestGit.head).toBe("");
    expect(project.latestGit.branches).toEqual([]);
    expect((await getDashboard(memberId, teamId)).projects).toHaveLength(1);
    await expect(addRemoteProject(ownerId, teamId, { name: "Duplicate", repositoryUrl: project.root })).rejects.toThrow("already in your team");
    await expect(addRemoteProject(outsiderId, teamId, { name: "Unauthorized", repositoryUrl: "https://github.com/team/secret" })).rejects.toThrow("not a member");
  });

  it("lets members create, edit, and complete work; rejects outsiders and stale edits", async () => {
    const input = featureFields.parse({ title: "Build signup", checklist: [{ text: "Validate email", done: false }] });
    const feature = await createPlannedFeature(memberId, teamId, projectId, input);
    expect(feature.status).toBe("planned");
    await expect(updatePlannedFeature(memberId, teamId, feature.id, { ...feature, status: "done", expectedUpdatedAt: feature.updatedAt })).rejects.toThrow("Complete the checklist");
    const changed = await updatePlannedFeature(memberId, teamId, feature.id, { ...feature, expectedUpdatedAt: feature.updatedAt, checklist: feature.checklist.map((item) => ({ ...item, done: true })), status: "done" });
    expect(changed.status).toBe("done");
    expect(changed.checklist[0].id).toBe(feature.checklist[0].id);
    await expect(updatePlannedFeature(ownerId, teamId, feature.id, { ...feature, expectedUpdatedAt: feature.updatedAt })).rejects.toThrow("changed while you were editing");
    await expect(updatePlannedFeature(outsiderId, teamId, feature.id, { ...changed, expectedUpdatedAt: changed.updatedAt })).rejects.toThrow("not a member");
  });

  it("rejects checklist ID injection and duplicate IDs", () => {
    const feature = makeFeature("project", featureFields.parse({ title: "Test checklist", checklist: [{ text: "Step one" }] }));
    expect(() => editFeature(feature, { ...feature, expectedUpdatedAt: feature.updatedAt, checklist: [{ id: "someone-elses-id", text: "Changed", done: true }] })).toThrow("Invalid checklist");
    expect(() => editFeature(feature, { ...feature, expectedUpdatedAt: feature.updatedAt, checklist: [feature.checklist[0], feature.checklist[0]] })).toThrow("Invalid checklist");
  });

  it("protects owner settings and member contact details", async () => {
    expect(await listTeamMembers(memberId, teamId)).toHaveLength(2);
    await expect(listTeamMembers(outsiderId, teamId)).rejects.toThrow("not a member");
    await expect(updateTeamName(memberId, teamId, "Unauthorized rename")).rejects.toThrow("Only the team owner");
    await updateTeamName(ownerId, teamId, "Updated team");
    expect((await getDashboard(ownerId, teamId)).selectedTeam?.name).toBe("Updated team");
    await expect(rotateTeamCode(memberId, teamId)).rejects.toThrow("Only the team owner");
    const code = await rotateTeamCode(ownerId, teamId);
    expect(code).not.toBe(originalCode);
    await expect(joinTeam({ userId: outsiderId, joinCode: originalCode })).rejects.toThrow("not valid");
  });

  it("removes member access and invalidates the old MCP/invitation code", async () => {
    const before = (await getDashboard(ownerId, teamId)).selectedTeam!.joinCode;
    await expect(removeTeamMember(memberId, teamId, ownerId)).rejects.toThrow("Only the team owner");
    await expect(removeTeamMember(ownerId, teamId, ownerId)).rejects.toThrow("owner cannot");
    const after = await removeTeamMember(ownerId, teamId, memberId);
    expect(after).not.toBe(before);
    await expect(listTeamMembers(memberId, teamId)).rejects.toThrow("not a member");
    expect((await getDashboard(memberId)).projects).toEqual([]);
    await expect(joinTeam({ userId: memberId, joinCode: before })).rejects.toThrow("not valid");
  });
});
