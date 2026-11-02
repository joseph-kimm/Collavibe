import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addRemoteProject, createTeam, joinTeam, mutate, signUpUser } from "../../src/store.js";
import type { Actor } from "../../src/collaboration-records.js";

export async function collaborationFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "collavibe-collaboration-"));
  process.env.COLLAVIBE_DATA_PATH = path.join(directory, "state.json");
  const account = async (name: string): Promise<Actor> => (await signUpUser({ name, email: `${name.toLowerCase()}@example.com`, password: "test-only-collaboration-password" })).user;
  const owner = await account("Owner"), member = await account("Member"), outsider = await account("Outsider");
  const team = await createTeam({ userId: owner.id, name: "Collaboration test" });
  await joinTeam({ userId: member.id, joinCode: team.joinCode });
  const project = await addRemoteProject(owner.id, team.id, { name: "Test app", repositoryUrl: "https://github.com/example/collaboration-tests" });
  const sessionId = "session_fixture_001";
  await mutate(state => {
    state.sessions.push({ id: sessionId, projectId: project.id, repoPath: project.root, participant: owner.name, userId: owner.id, status: "synced", startedAt: new Date().toISOString(), startSnapshot: project.latestGit });
  });
  return { owner, member, outsider, teamId: team.id, projectId: project.id, sessionId, cleanup: () => rm(directory, { recursive: true, force: true }) };
}
