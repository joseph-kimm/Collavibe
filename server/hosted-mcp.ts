import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chooseHostedWorkItem, getHostedSyncTemplate, getHostedTeamContext, startHostedSession, syncHostedSession } from "../src/hosted.js";
import { withoutInternalGitEvidence } from "../src/public.js";
import type { GitSnapshot } from "../src/types.js";

function result(message: string, structuredContent: Record<string, unknown>) {
  const publicContent = withoutInternalGitEvidence(structuredContent);
  return {
    content: [{ type: "text" as const, text: `${message}\n\nCollavibe data:\n${JSON.stringify(publicContent, null, 2)}` }],
    structuredContent: publicContent,
  };
}

const teamCodeSchema = z.string().min(8).max(16).describe("Team code copied from the hosted Collavibe workspace");
const sessionIdSchema = z.string().min(10).max(128);
const listItemSchema = z.string().min(1).max(2000);
const fileSchema = z.string().min(1).max(4096);
const commitSchema = z.object({
  hash: z.string().min(7).max(128),
  shortHash: z.string().min(4).max(32),
  author: z.string().min(1).max(300),
  authoredAt: z.string().min(10).max(100),
  subject: z.string().min(1).max(1000),
});
const branchSchema = z.object({
  name: z.string().min(1).max(255),
  head: z.string().min(4).max(128),
  fullHead: z.string().min(7).max(128).optional(),
  current: z.boolean(),
  upstream: z.string().min(1).max(255).optional(),
});
const gitStateSchema = z.object({
  branch: z.string().min(1).max(255).describe("Current Git branch"),
  head: z.string().min(7).max(128).describe("Full current commit hash"),
  dirty: z.boolean().default(false),
  workingFiles: z.array(fileSchema).max(500).default([]),
  branches: z.array(branchSchema).max(300).default([]),
  recentCommits: z.array(commitSchema).max(50).default([]),
  trackedFiles: z.array(fileSchema).max(5000).default([]),
});
const repositorySchema = z.object({
  key: z.string().min(3).max(2048).describe("Stable repository identity, preferably the sanitized Git remote URL or owner/repository"),
  name: z.string().min(1).max(200),
  remote: z.string().min(3).max(2048).optional().describe("Sanitized Git remote URL without credentials"),
  git: gitStateSchema,
});

function snapshot(root: string, remote: string | undefined, git: z.infer<typeof gitStateSchema>): GitSnapshot {
  return { root, remote, ...git, capturedAt: new Date().toISOString() };
}

export function createHostedCollavibeMcpServer() {
  const server = new McpServer(
    { name: "collavibe-cloud", version: "0.5.0" },
    {
      instructions: "This is the hosted Collavibe MCP. Inspect the repository with your own coding-agent tools, then pass a sanitized Git snapshot to Collavibe. Begin with get_project_context or start_collaboration_session. Present the returned options and wait for the human's selection before calling choose_work_item. At the end, inspect Git again and call sync_collaboration_session. Remote Git evidence is agent-attested, not independently read from the user's filesystem.",
    },
  );

  server.registerTool("get_project_context", {
    title: "Get hosted team context",
    description: "Load a team's shared projects, features, and prior coding sessions from hosted Collavibe. This remote tool does not access the developer filesystem.",
    inputSchema: { teamCode: teamCodeSchema, projectKey: z.string().min(3).max(2048).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async (input) => {
    const context = await getHostedTeamContext(input);
    return result(`Loaded ${context.team.name}: ${context.projects.length} project(s), ${context.features.length} feature(s), and ${context.sessions.length} session(s).`, { context });
  });

  server.registerTool("start_collaboration_session", {
    title: "Start a hosted Collavibe session",
    description: "Start team work in the hosted service after the coding agent inspects its repository and supplies the current Git snapshot.",
    inputSchema: {
      teamCode: teamCodeSchema,
      participant: z.string().min(2).max(120),
      intent: z.string().max(2000).optional(),
      project: repositorySchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ teamCode, participant, intent, project }) => {
    const started = await startHostedSession({
      teamCode,
      participant,
      intent,
      project: { key: project.key, name: project.name, remote: project.remote, git: snapshot(project.key, project.remote, project.git) },
    });
    return result(`Started hosted session ${started.session.id}. Present the returned work options and wait for the user's choice.`, { started });
  });

  server.registerTool("choose_work_item", {
    title: "Choose hosted session work",
    description: "Claim an existing feature or record a new feature after the user chooses what to build.",
    inputSchema: {
      teamCode: teamCodeSchema,
      sessionId: sessionIdSchema,
      featureId: z.string().min(10).max(128).optional(),
      newFeature: z.object({
        title: z.string().min(3).max(200),
        description: z.string().min(8).max(4000),
        checklist: z.array(z.string().min(3).max(500)).min(1).max(100),
      }).optional(),
      intendedBranch: z.string().min(1).max(255).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (input) => {
    const selected = await chooseHostedWorkItem(input);
    return result(`Selected ${selected.feature.title} for ${selected.session.participant}.`, { selected });
  });

  server.registerTool("get_sync_template", {
    title: "Get hosted session sync template",
    description: "Return the exact hosted handoff fields the coding agent should prepare at the end of the session.",
    inputSchema: { teamCode: teamCodeSchema, sessionId: sessionIdSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async (input) => result("Inspect the final Git state, summarize the chat with this template, then call sync_collaboration_session.", { template: await getHostedSyncTemplate(input) }));

  server.registerTool("sync_collaboration_session", {
    title: "Sync a hosted coding session",
    description: "Save the agent-authored handoff and final Git snapshot in hosted Collavibe. The website labels this evidence as agent-attested because the remote server cannot independently inspect a laptop filesystem.",
    inputSchema: {
      teamCode: teamCodeSchema,
      sessionId: sessionIdSchema,
      summary: z.string().min(12).max(10_000),
      workCompleted: z.array(listItemSchema).max(100),
      decisions: z.array(listItemSchema).max(100),
      blockers: z.array(listItemSchema).max(100),
      nextSteps: z.array(listItemSchema).max(100),
      changedFiles: z.array(fileSchema).max(500),
      endGit: gitStateSchema,
      completedChecklistItemIds: z.array(z.string().min(10).max(128)).max(100).optional(),
      featureStatus: z.enum(["planned", "active", "review", "done", "blocked"]).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ endGit, ...input }) => {
    const synced = await syncHostedSession({ ...input, endGit: snapshot("hosted", undefined, endGit) });
    return result(`Synced hosted session ${input.sessionId}: ${synced.attestation.commits.length} commit(s) and ${synced.attestation.changedFiles.length} changed file(s) recorded as agent-attested evidence.`, { synced });
  });

  server.registerPrompt("start", {
    title: "Start hosted collaborative coding",
    description: "Inspect the current repository and begin a hosted Collavibe session.",
    argsSchema: {
      team_code: teamCodeSchema,
      participant_name: z.string().min(2).max(120),
      repository_key: z.string().min(3).max(2048),
      project_name: z.string().min(1).max(200),
    },
  }, async ({ team_code, participant_name, repository_key, project_name }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Inspect the current repository using your native coding tools. Then call the hosted Collavibe start_collaboration_session tool with team code ${JSON.stringify(team_code)}, participant ${JSON.stringify(participant_name)}, repository key ${JSON.stringify(repository_key)}, project name ${JSON.stringify(project_name)}, and the current sanitized Git snapshot. Summarize teammate activity, present concrete work options, and wait for my selection before editing.` } }],
  }));

  server.registerPrompt("sync", {
    title: "Sync hosted collaborative coding",
    description: "Inspect final Git state and publish a hosted team handoff.",
    argsSchema: { team_code: teamCodeSchema, session_id: sessionIdSchema },
  }, async ({ team_code, session_id }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Prepare the end-of-session handoff for Collavibe session ${JSON.stringify(session_id)} using team code ${JSON.stringify(team_code)}. Call get_sync_template, inspect final Git state using your native coding tools, and then call sync_collaboration_session. Clearly state that remote evidence is agent-attested.` } }],
  }));

  return server;
}
