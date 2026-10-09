import { startCollaborationSession } from "../../src/store.js";

const [repoPath, participant] = process.argv.slice(2);
if (!repoPath || !participant) throw new Error("Expected repository path and participant name.");

await startCollaborationSession({ repoPath, participant });
