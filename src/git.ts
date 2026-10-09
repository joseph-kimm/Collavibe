import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import type { GitBranch, GitCommit, GitSnapshot, VerifiedDelta } from "./types.js";

const execFileAsync = promisify(execFile);

async function git(repoPath: string, args: string[], allowFailure = false): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 10_000,
    });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) return "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Git inspection failed: ${message}`);
  }
}

function parseCommits(value: string): GitCommit[] {
  if (!value) return [];
  return value.split("\n").filter(Boolean).map((line) => {
    const [hash, shortHash, author, authoredAt, ...subject] = line.split("\u001f");
    return { hash, shortHash, author, authoredAt, subject: subject.join("\u001f") };
  });
}

export async function resolveRepoRoot(repoPath: string): Promise<string> {
  const resolved = await realpath(repoPath);
  const root = await git(resolved, ["rev-parse", "--show-toplevel"]);
  return realpath(root);
}

export async function inspectRepository(repoPath: string): Promise<GitSnapshot> {
  const root = await resolveRepoRoot(repoPath);
  const [remote, branch, head, status, branchRows, commits, trackedFiles] = await Promise.all([
    git(root, ["remote", "get-url", "origin"], true),
    git(root, ["branch", "--show-current"]),
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["status", "--porcelain=v1", "-uall"]),
    git(root, ["for-each-ref", "--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)", "refs/heads", "refs/remotes/origin"]),
    git(root, ["log", "-n", "12", "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s"]),
    git(root, ["ls-files"]),
  ]);

  const workingFiles = status.split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
  const branches: GitBranch[] = branchRows.split("\n").filter((line) => line && !line.startsWith("origin/HEAD\t")).map((line) => {
    const [name, branchHead, upstream] = line.split("\t");
    return { name, head: branchHead, current: name === branch, upstream: upstream || undefined };
  });

  return {
    root,
    remote: remote || undefined,
    branch: branch || "detached",
    head,
    dirty: workingFiles.length > 0,
    workingFiles,
    branches,
    recentCommits: parseCommits(commits),
    trackedFiles: trackedFiles.split("\n").filter(Boolean).sort(),
    capturedAt: new Date().toISOString(),
  };
}

export async function inspectDelta(start: GitSnapshot, current: GitSnapshot, reportedFiles: string[]): Promise<VerifiedDelta> {
  if (start.root !== current.root) throw new Error("The session repository no longer matches its starting repository.");
  const [commitsRaw, committedFilesRaw] = await Promise.all([
    start.head === current.head
      ? Promise.resolve("")
      : git(current.root, ["log", `${start.head}..${current.head}`, "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s"], true),
    git(current.root, ["diff", "--name-only", start.head, current.head], true),
  ]);
  const changedFiles = [...new Set([
    ...committedFilesRaw.split("\n").filter(Boolean),
    ...current.workingFiles,
  ])].sort();
  return {
    startHead: start.head,
    endHead: current.head,
    commits: parseCommits(commitsRaw),
    changedFiles,
    workingFiles: current.workingFiles,
    reportedButUnverified: reportedFiles.filter((file) => !changedFiles.includes(file)).sort(),
  };
}
