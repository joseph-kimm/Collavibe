export async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}

export function selectedCourseTeam(account) {
  try {
    const saved = sessionStorage.getItem("collavibe-course-team:" + account.id);
    if (account.teams.some(team => team.id === saved)) return saved;
  } catch { /* Storage may be unavailable in a private browser. */ }
  return account.teams[0]?.id;
}

export function rememberCourseTeam(account, teamId) {
  try {
    sessionStorage.setItem("collavibe-course-team:" + account.id, teamId);
  } catch { /* The selection still applies on the current page. */ }
}
