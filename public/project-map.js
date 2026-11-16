import { sessionCommits } from "./commit-evidence.js";
const unique = (items) => [...new Set(items.filter(Boolean))];
const personName = (value) => String(value || "").trim();

// A display name is not an account identity. Legacy records remain separate;
// attaching one to an account on name alone could misattribute another person.
export function contributorKey(name, userId) {
  const id = personName(userId);
  return id ? "user:" + id : personName(name) ? "legacy:" + personName(name) : "";
}
export const sessionContributorKey = (session) => contributorKey(session?.participant, session?.userId);
export const featureOwnerKey = (feature) => contributorKey(feature?.owner, feature?.ownerUserId);

function contributorDirectory(features, sessions) {
  const records = new Map();
  const record = (key, name, timestamp) => {
    if (!key) return;
    const previous = records.get(key);
    if (!previous || (name && timestamp >= previous.timestamp)) records.set(key, { key, name: personName(name) || previous?.name || "Unnamed contributor", timestamp });
  };
  for (const feature of features) record(featureOwnerKey(feature), feature.owner, feature.updatedAt || feature.createdAt || "");
  for (const session of sessions) record(sessionContributorKey(session), session.participant, session.syncedAt || session.startedAt || "");
  const people = [...records.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return people.map(({ timestamp, ...person }) => {
    const duplicates = people.filter((other) => other.name === person.name);
    let label = person.name;
    if (duplicates.length > 1) {
      if (person.key.startsWith("legacy:")) label += " · legacy records";
      else {
        const id = person.key.slice(5);
        let length = 6;
        while (length < id.length && duplicates.some((other) => other.key !== person.key && other.key.startsWith("user:") && other.key.slice(5, 5 + length) === id.slice(0, length))) length++;
        label += " · " + id.slice(0, length);
      }
    }
    return { ...person, label };
  });
}

export function sessionBranch(session) {
  return session?.sync?.verified?.endBranch || session?.startSnapshot?.branch || "";
}

// Relationships come from recorded work, never inferred from team membership.
export function buildProjectMap({ projectId, features = [], sessions = [], query = "", person = "all", status = "all", priority = "all", archived = false }) {
  const projectFeatures = features.filter((feature) => feature.projectId === projectId);
  const projectSessions = sessions.filter((session) => session.projectId === projectId);
  const people = contributorDirectory(projectFeatures, projectSessions);
  const search = query.trim().toLowerCase();
  const matchesSession = (session) => !search || JSON.stringify([session.participant, session.intent, sessionBranch(session), session.sync]).toLowerCase().includes(search);
  const entries = projectFeatures.filter((feature) => Boolean(feature.archivedAt) === archived).map((feature) => {
    const linked = projectSessions.filter((session) => session.featureId === feature.id).sort((a, b) => (b.syncedAt || b.startedAt).localeCompare(a.syncedAt || a.startedAt));
    return { feature, sessions: linked, people: unique([featureOwnerKey(feature), ...linked.map(sessionContributorKey)]) };
  }).filter(({ feature, sessions: linked, people: involved }) => {
    const matchesPerson = person === "all" || (person === "unassigned" ? !featureOwnerKey(feature) : involved.includes(person));
    return matchesPerson && (status === "all" || feature.status === status) && (priority === "all" || (feature.priority || "normal") === priority) && (!search || JSON.stringify([feature.title, feature.description, feature.owner, feature.branch, feature.checklist, feature.comments]).toLowerCase().includes(search) || linked.some(matchesSession));
  }).map((entry) => ({ ...entry, sessions: person === "all" || person === "unassigned" ? entry.sessions : entry.sessions.filter((session) => sessionContributorKey(session) === person) }));
  const unlinked = projectSessions.filter((session) => !projectFeatures.some((feature) => feature.id === session.featureId));
  const unlinkedSessions = !archived && status === "all" && priority === "all" ? unlinked.filter((session) => (person === "all" || sessionContributorKey(session) === person) && matchesSession(session)) : [];
  const shownKeys = new Set([...entries.flatMap((entry) => entry.people), ...unlinkedSessions.map(sessionContributorKey)]);
  const shownPeople = people.filter(({ key }) => shownKeys.has(key) && (person === "all" || person === "unassigned" || key === person));
  const groups = shownPeople.map((person) => ({
    ...person,
    entries: entries.filter((entry) => entry.people.includes(person.key)),
    sessions: projectSessions.filter((session) => sessionContributorKey(session) === person.key && (entries.some((entry) => entry.feature.id === session.featureId) || unlinkedSessions.some((item) => item.id === session.id))),
  }));
  if (entries.some((entry) => !entry.people.length)) groups.push({ key: "unassigned", name: "Unassigned", label: "Unassigned", unassigned: true, entries: entries.filter((entry) => !entry.people.length), sessions: [] });
  const commits = unique(projectSessions.flatMap((session) => sessionCommits(session).map((commit) => commit.hash)));
  return { entries, groups, people, unlinkedSessions, summary: {
    features: projectFeatures.filter((feature) => !feature.archivedAt).length,
    people: people.length, sessions: projectSessions.length,
    handoffs: projectSessions.filter((session) => session.status === "synced").length,
    commits: commits.length,
  } };
}
