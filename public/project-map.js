const unique = (items) => [...new Set(items.filter(Boolean))];
const personName = (value) => String(value || "").trim();

export function sessionBranch(session) {
  return session?.sync?.verified?.endBranch || session?.startSnapshot?.branch || "";
}

// Relationships come from recorded work, never inferred from team membership.
export function buildProjectMap({ projectId, features = [], sessions = [], query = "", person = "all", status = "all", priority = "all", archived = false }) {
  const projectFeatures = features.filter((feature) => feature.projectId === projectId);
  const projectSessions = sessions.filter((session) => session.projectId === projectId);
  const people = unique([...projectFeatures.map((feature) => personName(feature.owner)), ...projectSessions.map((session) => personName(session.participant))]).sort();
  const search = query.trim().toLowerCase();
  const matchesSession = (session) => !search || JSON.stringify([session.participant, session.intent, sessionBranch(session), session.sync]).toLowerCase().includes(search);
  const entries = projectFeatures.filter((feature) => Boolean(feature.archivedAt) === archived).map((feature) => {
    const linked = projectSessions.filter((session) => session.featureId === feature.id).sort((a, b) => (b.syncedAt || b.startedAt).localeCompare(a.syncedAt || a.startedAt));
    return { feature, sessions: linked, people: unique([personName(feature.owner), ...linked.map((session) => personName(session.participant))]) };
  }).filter(({ feature, sessions: linked, people: involved }) => {
    const matchesPerson = person === "all" || (person === "unassigned" ? !personName(feature.owner) : involved.includes(person));
    return matchesPerson && (status === "all" || feature.status === status) && (priority === "all" || (feature.priority || "normal") === priority) && (!search || JSON.stringify([feature.title, feature.description, feature.owner, feature.branch, feature.checklist, feature.comments]).toLowerCase().includes(search) || linked.some(matchesSession));
  });
  const unlinked = projectSessions.filter((session) => !projectFeatures.some((feature) => feature.id === session.featureId));
  const unlinkedSessions = !archived && status === "all" && priority === "all" ? unlinked.filter((session) => (person === "all" || personName(session.participant) === person) && matchesSession(session)) : [];
  const shownPeople = unique([...entries.flatMap((entry) => entry.people), ...unlinkedSessions.map((session) => personName(session.participant))]).sort().filter((name) => person === "all" || person === "unassigned" || name === person);
  const groups = shownPeople.map((name) => ({
    name,
    entries: entries.filter((entry) => entry.people.includes(name)),
    sessions: projectSessions.filter((session) => personName(session.participant) === name && (entries.some((entry) => entry.feature.id === session.featureId) || unlinkedSessions.some((item) => item.id === session.id))),
  }));
  if (entries.some((entry) => !entry.people.length)) groups.push({ name: "Unassigned", unassigned: true, entries: entries.filter((entry) => !entry.people.length), sessions: [] });
  const commits = unique(projectSessions.flatMap((session) => session.sync?.verified?.commits?.map((commit) => commit.hash) || []));
  return { entries, groups, people, unlinkedSessions, summary: {
    features: projectFeatures.filter((feature) => !feature.archivedAt).length,
    people: people.length, sessions: projectSessions.length,
    handoffs: projectSessions.filter((session) => session.status === "synced").length,
    commits: commits.length,
  } };
}
