import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
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
    return stdout.trimEnd();
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

function parseNulList(value: string): string[] {
  return value.split("\0").filter(Boolean);
}

function sanitizeRemote(value: string): string {
  if (!value) return "";
  try {
    const remote = new URL(value);
    remote.username = "";
    remote.password = "";
    return remote.toString();
  } catch {
    return value.replace(/^[^/@:]+@(?=[^/]+:)/, "");
  }
}

async function fingerprintFile(root: string, file: string): Promise<string> {
  try {
    const details = await lstat(path.join(root, file));
    if (details.isDirectory()) {
      const submoduleDiff = await git(root, ["diff", "--submodule=short", "HEAD", "--", file], true);
      return createHash("sha256").update(`${details.mode}:${submoduleDiff}`).digest("hex");
    }
    const objectHash = await git(root, ["hash-object", "--no-filters", "--", file]);
    return createHash("sha256").update(`${details.mode}:${objectHash}`).digest("hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

async function inspectWorkingTree(root: string) {
  const [tracked, untracked] = await Promise.all([
    git(root, ["diff", "--name-only", "-z", "--no-renames", "HEAD"]),
    git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const workingFiles = [...new Set([...parseNulList(tracked), ...parseNulList(untracked)])].sort();
  const fingerprintRows = await Promise.all(workingFiles.map(async (file) => [file, await fingerprintFile(root, file)] as const));
  return { workingFiles, workingFileFingerprints: Object.fromEntries(fingerprintRows) };
}

export async function resolveRepoRoot(repoPath: string): Promise<string> {
  const resolved = await realpath(repoPath);
  const root = await git(resolved, ["rev-parse", "--show-toplevel"]);
  return realpath(root);
}

export async function inspectRepository(repoPath: string): Promise<GitSnapshot> {
  const root = await resolveRepoRoot(repoPath);
  const [remote, branch, head, workingTree, branchRows, commits, trackedFiles] = await Promise.all([
    git(root, ["remote", "get-url", "origin"], true),
    git(root, ["branch", "--show-current"]),
    git(root, ["rev-parse", "HEAD"]),
    inspectWorkingTree(root),
    git(root, ["for-each-ref", "--format=%(refname:short)%09%(objectname)%09%(upstream:short)", "refs/heads", "refs/remotes/origin"]),
    git(root, ["log", "-n", "12", "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s"]),
    git(root, ["ls-files", "-z"]),
  ]);

  const branches: GitBranch[] = branchRows.split("\n").filter((line) => line && !line.startsWith("origin/HEAD\t")).map((line) => {
    const [name, branchHead, upstream] = line.split("\t");
    return { name, head: branchHead.slice(0, 7), fullHead: branchHead, current: name === branch, upstream: upstream || undefined };
  });

  return {
    root,
    remote: sanitizeRemote(remote) || undefined,
    branch: branch || "detached",
    head,
    dirty: workingTree.workingFiles.length > 0,
    workingFiles: workingTree.workingFiles,
    workingFileFingerprints: workingTree.workingFileFingerprints,
    branches,
    recentCommits: parseCommits(commits),
    trackedFiles: parseNulList(trackedFiles).sort(),
    capturedAt: new Date().toISOString(),
  };
}

export async function inspectDelta(start: GitSnapshot, current: GitSnapshot, reportedFiles: string[]): Promise<VerifiedDelta> {
  if (start.root !== current.root) throw new Error("The session repository no longer matches its starting repository.");
  const knownHeads = [...new Set([start.head, ...start.branches.map((branch) => branch.fullHead).filter((head): head is string => Boolean(head))])];
  const commitsRaw = start.head === current.head
    ? ""
    : await git(current.root, ["log", current.head, "--not", ...knownHeads, "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s"], true);
  const commits = parseCommits(commitsRaw);
  const committedFileRows = await Promise.all(commits.map((commit) => git(current.root, ["diff-tree", "--root", "-m", "--no-commit-id", "--name-only", "-z", "-r", "--no-renames", commit.hash], true)));
  const changedWorkingFiles = current.workingFiles.filter((file) => {
    const startingFingerprint = start.workingFileFingerprints?.[file];
    return !startingFingerprint || startingFingerprint !== current.workingFileFingerprints?.[file];
  });
  const changedFiles = [...new Set([
    ...committedFileRows.flatMap(parseNulList),
    ...changedWorkingFiles,
  ])].sort();
  return {
    startHead: start.head,
    endHead: current.head,
    startBranch: start.branch,
    endBranch: current.branch,
    commits,
    changedFiles,
    workingFiles: changedWorkingFiles,
    reportedButUnverified: reportedFiles.filter((file) => !changedFiles.includes(file)).sort(),
  };
}
