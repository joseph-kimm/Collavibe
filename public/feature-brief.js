// A portable read-only brief, not an instruction to create a session or do work.
export function featureBrief(feature, project, sessions = []) {
  const linked = sessions.filter(s => s.projectId === feature.projectId && s.featureId === feature.id)
    .sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
  return [
    `# ${feature.title}`, `Project: ${project?.name || feature.projectId}`, `Feature ID: ${feature.id}`,
    `Status: ${feature.status}`, `Owner: ${feature.owner || 'Unassigned'}`, '',
    feature.description || 'No description recorded.', '', '## Checklist',
    ...(feature.checklist || []).map(c => `- [${c.done ? 'x' : ' '}] ${c.text}`), '',
    `## Recorded session history (${linked.length})`,
    ...linked.flatMap(s => [`- ${s.startedAt || 'Date not recorded'} · ${s.participant || 'Contributor'} · ${s.status} · ${s.id}`, `  ${s.sync?.summary || s.intent || 'No handoff saved yet.'}`]), '',
    'This is saved project context. A feature can continue across multiple work sessions, and a session can contain many prompts, edits, and tests. This brief does not start a session, claim work, or authorize any action.',
  ].join('\n');
}
