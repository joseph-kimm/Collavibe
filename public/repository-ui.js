// A saved URL is not a provider connection or a continuously updated Git snapshot.
export function repositoryPresentation(project, sample = false) {
  let url;
  try {
    let remote = project?.remote || project?.root || "";
    remote = remote.replace(/^git@([^:]+):(.+)$/, "https://$1/$2");
    url = new URL(remote);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\.git\/?$/, "").replace(/\/$/, "");
  } catch { return null; }
  const provider = ({ "github.com": "GitHub", "gitlab.com": "GitLab", "bitbucket.org": "Bitbucket" })[url.hostname] || url.hostname;
  const git = project?.latestGit;
  const hasSnapshot = Boolean(git?.head);
  return {
    url: url.href,
    name: url.pathname.slice(1) || url.hostname,
    provider,
    label: sample ? "Sample repository" : "Linked repository",
    status: sample ? "Sample data" : hasSnapshot ? "Agent snapshot available" : "Waiting for agent snapshot",
    description: sample
      ? "This is an example, not your repository. Sign in to add your own project."
      : hasSnapshot
        ? "Branches and files come from your agent’s last snapshot, not a live GitHub sync."
        : "Repository URL saved. Start an agent session to share branches and files. Pushes are not imported automatically.",
    hasSnapshot,
    branch: hasSnapshot ? git.branch || "" : "",
    capturedAt: hasSnapshot ? git.capturedAt || "" : "",
  };
}
