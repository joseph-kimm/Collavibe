const views = new Set(["map", "work", "sessions", "repository", "team", "tickets", "meetings", "portfolio"]);

export function hasWorkspaceRoute(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  return ["team", "project", "view", "feature", "session"].some(key => params.has(key));
}

// The URL belongs to this tab; saved choices are only a fallback for bare links.
export function readWorkspaceRoute(hash, saved = {}) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const teamId = params.get("team") || saved.teamId || "";
  const projectId = params.get("project") || saved.projectId || "";
  let view = views.has(params.get("view")) ? params.get("view") : "map";
  let selection = params.get("feature") ? { kind: "feature", id: params.get("feature") } : null;
  if (params.get("session")) {
    selection = { kind: "session", id: params.get("session") };
    if (view !== "map") view = "sessions";
  }
  return { teamId, projectId, view, selection };
}

// Both initial loading and same-document navigation use the identical resolver.
export function bindWorkspaceNavigation(target, onRoute, fallback) {
  const restore = () => {
    if (!hasWorkspaceRoute(target.location.hash)) return;
    onRoute(readWorkspaceRoute(target.location.hash, fallback()));
  };
  target.addEventListener("hashchange", restore);
  return () => target.removeEventListener("hashchange", restore);
}

// User navigation creates history; background refreshes only reconcile the URL.
export function writeWorkspaceUrl(target, url, push = false) {
  const current = target.location.pathname + target.location.search + target.location.hash;
  if (current === url) return;
  target.history[push ? "pushState" : "replaceState"](null, "", url);
}
