import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chooseWorkItem, getProjectContext, startCollaborationSession, syncCollaborationSession } from "../src/store.js";
import { withoutInternalGitEvidence } from "../src/public.js";

function result(message: string, structuredContent: Record<string, unknown>) {
  const publicContent = withoutInternalGitEvidence(structuredContent);
  return {
    content: [{
      type: "text" as const,
      text: `${message}\n\nCollavibe data:\n${JSON.stringify(publicContent, null, 2)}`,
    }],
    structuredContent: publicContent,
  };
}

const repoPathSchema = z.string().min(1).max(4096).describe("Absolute path to the local Git repository");
const sessionIdSchema = z.string().min(10).max(128);
const listItemSchema = z.string().min(1).max(2000);

export function createCollavibeMcpServer() {
  const server = new McpServer(
    { name: "collavibe", version: "0.2.0" },
    {
      instructions: "Use get_project_context before discussing shared work. At the beginning of a coding session, call start_collaboration_session, present its work options, and call choose_work_item after the user chooses. At the end, the agent must author a concise factual summary and call sync_collaboration_session. Treat agent summaries as claims; Git commits and changed files are independently verified by Collavibe.",
    },
  );

  server.registerTool("get_project_context", {
    title: "Get shared project context",
    description: "Use this when the user wants to understand current team work before coding. Reads the repository, refreshes Collavibe's project snapshot, and returns the feature tree and prior sessions without changing source files.",
    inputSchema: { repoPath: repoPathSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ repoPath }) => {
    const context = await getProjectContext(repoPath);
    return result(`Loaded ${context.project.name}: ${context.features.length} feature(s), ${context.sessions.length} recorded session(s), current branch ${context.project.latestGit.branch}.`, { context });
  });

  server.registerTool("start_collaboration_session", {
    title: "Start a Collavibe session",
    description: "Use this before editing code. Captures the starting Git state, recent teammate sessions, and concrete work choices for the user. It does not edit code or switch branches.",
    inputSchema: {
      repoPath: repoPathSchema,
      participant: z.string().min(2).max(120).describe("Human teammate name"),
      intent: z.string().max(2000).optional().describe("What the user may want to work on, if already known"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const started = await startCollaborationSession(input);
    return result(`Started session ${started.session.id}. Present the returned work options and ask the user to choose before changing code.`, { started });
  });

  server.registerTool("choose_work_item", {
    title: "Choose session work",
    description: "Use this only after the user chooses what to build. Claims an existing feature or records a new feature and its completion checklist for this session.",
    inputSchema: {
      sessionId: sessionIdSchema,
      featureId: z.string().min(10).max(128).optional(),
      newFeature: z.object({
        title: z.string().min(3).max(200),
        description: z.string().min(8).max(4000),
        checklist: z.array(z.string().min(3).max(500)).min(1).max(100),
      }).optional(),
      intendedBranch: z.string().min(1).max(255).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const selected = await chooseWorkItem(input);
    return result(`Selected ${selected.feature.title} for ${selected.session.participant}.`, { selected });
  });

  server.registerTool("get_sync_template", {
    title: "Get session sync template",
    description: "Use this near the end of a coding chat to see exactly what context the agent must summarize before syncing.",
    inputSchema: { sessionId: sessionIdSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ sessionId }) => result("Summarize the current coding session using this structure, then call sync_collaboration_session.", {
    template: {
      sessionId,
      summary: "Two or three factual sentences explaining the outcome and current state.",
      workCompleted: ["Concrete behavior implemented or investigated"],
      decisions: ["Decision and brief rationale"],
      blockers: ["Unresolved blocker, or an empty array"],
      nextSteps: ["Specific continuation step"],
      agentReportedFiles: ["Repository-relative path actually touched"],
      completedChecklistItemIds: ["IDs returned by choose_work_item"],
      featureStatus: "review",
    },
  }));

  server.registerTool("sync_collaboration_session", {
    title: "Sync a coding session",
    description: "Use this at the end of the chat after the agent summarizes the session. Stores the summary and independently verifies commits and changed files against the starting Git snapshot. It never commits or pushes code.",
    inputSchema: {
      sessionId: sessionIdSchema,
      summary: z.string().min(12).max(10_000),
      workCompleted: z.array(listItemSchema).max(100),
      decisions: z.array(listItemSchema).max(100),
      blockers: z.array(listItemSchema).max(100),
      nextSteps: z.array(listItemSchema).max(100),
      agentReportedFiles: z.array(z.string().min(1).max(4096)).max(500),
      completedChecklistItemIds: z.array(z.string().min(10).max(128)).max(100).optional(),
      featureStatus: z.enum(["planned", "active", "review", "done", "blocked"]).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const synced = await syncCollaborationSession(input);
    return result(`Synced session ${input.sessionId}: ${synced.verification.commits.length} commit(s), ${synced.verification.changedFiles.length} changed file(s) verified.`, { synced });
  });

  server.registerPrompt("start", {
    title: "Start collaborative coding",
    description: "Begin a Collavibe coding session and choose team work before editing.",
    argsSchema: {
      repo_path: repoPathSchema,
      participant_name: z.string().min(2).max(120).describe("Your name"),
    },
  }, async ({ repo_path, participant_name }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Start a Collavibe session for participant ${JSON.stringify(participant_name)} in repository ${JSON.stringify(repo_path)}. Call start_collaboration_session now. Summarize current project and teammate activity, present concrete work choices, and wait for my selection before editing code.` } }],
  }));

  server.registerPrompt("sync", {
    title: "Sync collaborative coding",
    description: "Summarize the current chat and reconcile it with Git before handing work to the team.",
    argsSchema: { session_id: sessionIdSchema.describe("Collavibe session ID from the start command") },
  }, async ({ session_id }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Prepare the factual end-of-session handoff for Collavibe session ${JSON.stringify(session_id)}. First call get_sync_template. Summarize this chat's completed work, decisions, blockers, next steps, and repository-relative files. Then call sync_collaboration_session. Clearly distinguish your summary from the Git-verified result.` } }],
  }));

  return server;
}
