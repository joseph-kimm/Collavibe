// User navigation creates history; background refreshes only reconcile the URL.
export function writeWorkspaceUrl(target, url, push = false) {
  const current = target.location.pathname + target.location.search + target.location.hash;
  if (current === url) return;
  target.history[push ? "pushState" : "replaceState"](null, "", url);
}
