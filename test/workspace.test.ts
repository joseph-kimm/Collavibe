import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addRemoteProject, createPlannedFeature, createTeam, getDashboard, joinTeam, listTeamMembers, removeTeamMember, rotateTeamCode, signUpUser, updatePlannedFeature, updateTeamName, updateWorkspaceProject, workspaceFeatureAction } from "../src/store.js";
import { applyFeatureAction, editFeature, featureActionSchema, featureFields, featurePatchSchema, makeFeature, repositoryKey } from "../src/workspace-model.js";

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

  it("validates priorities, calendar dates and comment input", () => {
    expect(featureFields.parse({ title: "Plan feature" }).priority).toBe("normal");
    expect(featureFields.parse({ title: "Plan feature", dueDate: "2028-02-29", priority: "urgent" }).dueDate).toBe("2028-02-29");
    for (const dueDate of ["2027-02-29", "2026-13-01", "tomorrow", "2026-01-01T00:00:00Z"]) expect(() => featureFields.parse({ title: "Plan feature", dueDate })).toThrow();
    expect(() => featureFields.parse({ title: "Plan feature", priority: "critical" })).toThrow();
    expect(() => featureActionSchema.parse({ action: "comment", text: "   " })).toThrow();
    expect(() => featureActionSchema.parse({ action: "comment", text: "x".repeat(2001) })).toThrow();
  });

  it("preserves new metadata from an older browser and accepts explicit clearing", () => {
    const feature = makeFeature("project", featureFields.parse({ title: "Keep metadata", priority: "urgent", dueDate: "2026-12-15" }));
    const { priority, dueDate, ...legacy } = feature;
    const input = featurePatchSchema.parse({ ...legacy, expectedUpdatedAt: feature.updatedAt, title: "Older browser edit" });
    expect(input.priority).toBeUndefined(); expect(input.dueDate).toBeUndefined();
    const edited = editFeature(feature, input);
    expect(edited.priority).toBe(priority); expect(edited.dueDate).toBe(dueDate);
    const cleared = editFeature(edited, { ...edited, expectedUpdatedAt: edited.updatedAt, priority: "normal", dueDate: "" });
    expect(cleared.priority).toBe("normal"); expect(cleared.dueDate).toBe("");
  });

  it("keeps simultaneous discussions, prevents author spoofing and protects deletion", async () => {
    const feature = await createPlannedFeature(memberId, teamId, projectId, featureFields.parse({ title: "Discuss design", priority: "high", dueDate: "2026-12-10" }));
    await Promise.all([workspaceFeatureAction({ id: memberId, name: "Member" }, teamId, feature.id, { action: "comment", text: "One" }), workspaceFeatureAction({ id: ownerId, name: "Owner" }, teamId, feature.id, { action: "comment", text: "Two" })]);
    let current = (await getDashboard(ownerId, teamId)).features.find((item) => item.id === feature.id)!;
    expect(current.comments).toHaveLength(2);
    expect(current.priority).toBe("high"); expect(current.dueDate).toBe("2026-12-10");
    const ownerComment = current.comments!.find((item) => item.userId === ownerId)!;
    await expect(workspaceFeatureAction({ id: memberId, name: "Member" }, teamId, feature.id, { action: "remove-comment", commentId: ownerComment.id })).rejects.toMatchObject({ status: 403 });
    await expect(workspaceFeatureAction({ id: outsiderId, name: "Outsider" }, teamId, feature.id, { action: "comment", text: "Outside" })).rejects.toThrow("not a member");
    current = await updatePlannedFeature(ownerId, teamId, feature.id, { ...current, expectedUpdatedAt: current.updatedAt, title: "Edited design" });
    expect(current.comments).toHaveLength(2);
    current = await workspaceFeatureAction({ id: ownerId, name: "Owner" }, teamId, feature.id, { action: "remove-comment", commentId: current.comments![0].id });
    expect(current.comments).toHaveLength(1);
    await expect(updatePlannedFeature(ownerId, teamId, feature.id, { ...feature, expectedUpdatedAt: feature.updatedAt })).rejects.toMatchObject({ status: 409 });
  });

  it("archives and restores without losing feature history", async () => {
    let feature = await createPlannedFeature(ownerId, teamId, projectId, featureFields.parse({ title: "Keep history", checklist: [{ text: "Keep this" }] }));
    const actor = { id: ownerId, name: "Owner" };
    feature = await workspaceFeatureAction(actor, teamId, feature.id, { action: "comment", text: "Preserve discussion" });
    const before = feature;
    feature = await workspaceFeatureAction(actor, teamId, feature.id, { action: "archive", archived: true, expectedUpdatedAt: feature.updatedAt });
    expect(feature.archivedAt).toBeTruthy();
    await expect(updatePlannedFeature(ownerId, teamId, feature.id, { ...feature, expectedUpdatedAt: feature.updatedAt })).rejects.toMatchObject({ status: 409 });
    await expect(workspaceFeatureAction(actor, teamId, feature.id, { action: "comment", text: "No" })).rejects.toMatchObject({ status: 409 });
    await expect(workspaceFeatureAction(actor, teamId, feature.id, { action: "archive", archived: false, expectedUpdatedAt: before.updatedAt })).rejects.toMatchObject({ status: 409 });
    feature = await workspaceFeatureAction(actor, teamId, feature.id, { action: "archive", archived: false, expectedUpdatedAt: feature.updatedAt });
    expect(feature.archivedAt).toBeUndefined(); expect(feature.comments).toEqual(before.comments); expect(feature.checklist).toEqual(before.checklist);
    expect(() => applyFeatureAction(feature, { action: "archive", archived: true, expectedUpdatedAt: feature.updatedAt }, { ...actor, owner: true }, true)).toThrow("Sync that session");
  });

  it("limits project settings to owners and makes archived projects read-only", async () => {
    const project = (await getDashboard(ownerId, teamId)).projects.find((item) => item.id === projectId)!;
    const input = { name: "Renamed project", archived: true, expectedUpdatedAt: project.updatedAt };
    await expect(updateWorkspaceProject(memberId, teamId, projectId, input)).rejects.toMatchObject({ status: 403 });
    let changed = await updateWorkspaceProject(ownerId, teamId, projectId, input);
    expect(changed.archivedAt).toBeTruthy(); expect(changed.name).toBe(input.name);
    await expect(createPlannedFeature(memberId, teamId, projectId, featureFields.parse({ title: "No writes" }))).rejects.toMatchObject({ status: 409 });
    await expect(updateWorkspaceProject(ownerId, teamId, projectId, input)).rejects.toMatchObject({ status: 409 });
    changed = await updateWorkspaceProject(ownerId, teamId, projectId, { ...input, archived: false, expectedUpdatedAt: changed.updatedAt });
    expect(changed.archivedAt).toBeUndefined();
    expect((await getDashboard(ownerId, teamId)).features.length).toBeGreaterThan(0);
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
