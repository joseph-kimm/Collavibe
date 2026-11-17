import { repositoryPresentation } from './repository-ui.js';
import { commitEvidenceNotice } from './commit-evidence.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function githubCommitUrl(project, session, hash) {
  if (!/^[a-f0-9]{7,64}$/i.test(hash || '')) return null;
  // A historical session belongs to its captured repository even if the project is relinked.
  const remote = session?.startSnapshot?.remote || project?.remote || project?.root;
  const normalized = typeof remote === 'string' ? remote.replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/') : remote;
  const repo = repositoryPresentation({remote:normalized});
  if (!repo) return null;
  const url = new URL(repo.url);
  if (url.hostname !== 'github.com' || url.port || !/^\/[\w.-]+\/[\w.-]+$/.test(url.pathname)) return null;
  return `${repo.url}/commit/${hash}`;
}

export function renderSessionEvidence(sync, {project, session, sample = false} = {}) {
  const verified = sync?.verified;
  if (!verified) return '<section class="detail-section"><h3>Commits</h3><p class="subtle">No commits recorded yet. They appear here when your agent saves a handoff with a Git snapshot.</p></section>';
  const commits = (verified.commitEvidence === 'recent_context_only' ? verified.unverifiedRecentCommits : verified.commits) || [];
  const contextOnly = verified.source === 'agent_attested' && verified.commitEvidence !== 'explicit_range';
  const rows = commits.map(commit => {
    const href = sample ? null : githubCommitUrl(project, session, commit.hash || commit.shortHash);
    const hash = escape(commit.shortHash || commit.hash?.slice(0,7) || 'Commit');
    return `<li>${href ? `<a class="session-commit-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="View commit ${hash} on GitHub (opens in new tab)"><code>${hash}</code><span>View on GitHub ↗</span></a>` : `<code>${hash}</code>`}<span>${escape(commit.subject)}</span><small>Git author: ${escape(commit.author || 'Not recorded')}</small></li>`;
  }).join('');
  const files = verified.changedFiles || [];
  return `<section class="detail-section"><h3>${contextOnly ? 'Recent repository commits' : 'Commits'} <span class="subtle">${commits.length}</span></h3>${contextOnly ? '<p class="subtle">These commits are repository context, not verified work from this session.</p>' : ''}${sample ? '<p class="subtle">Sample commits for illustration; these do not link to a real repository.</p>' : ''}${commits.length ? `<ul class="commit-list">${rows}</ul>` : '<p class="subtle">No commits were recorded in this handoff.</p>'}<details class="commit-provenance"><summary>About these commits</summary><p>${escape(commitEvidenceNotice(verified))}</p>${verified.startHead && verified.endHead ? `<p><code>${escape(verified.startHead.slice(0,7))} → ${escape(verified.endHead.slice(0,7))}</code></p>` : ''}</details></section>${files.length ? `<details class="detail-section"><summary>Changed files · ${files.length}</summary><ul class="file-list">${files.map(file=>`<li>${escape(file)}</li>`).join('')}</ul></details>` : ''}`;
}
