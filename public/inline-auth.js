// Same cookie-backed account flow on every page, without leaving its content.
export function mountSignIn(host, { message = "Sign in to continue.", onSuccess = () => location.reload() } = {}) {
  host.innerHTML = '<section class="inline-auth"><p class="auth-message"></p><h2>Log in to Collavibe</h2><div class="auth-tabs"><button type="button" data-mode="login" aria-pressed="true">Log in</button><button type="button" data-mode="signup" aria-pressed="false">Create account</button></div><form class="form"><label data-name hidden>Your name<input name="name" autocomplete="name" minlength="2" maxlength="120"/></label><label>Email<input name="email" type="email" autocomplete="email" required/></label><label>Password<input name="password" aria-label="Password" type="password" autocomplete="current-password" minlength="10" maxlength="256" required/><small data-hint hidden>Use at least 10 characters.</small></label><p class="form-error" role="alert"></p><button class="button primary" type="submit">Log in</button></form></section>';
  host.querySelector(".auth-message").textContent = message;
  const form = host.querySelector("form");
  const submit = form.querySelector('[type="submit"]');
  const error = form.querySelector(".form-error");
  const modes = [...host.querySelectorAll("[data-mode]")];
  let mode = "login";
  modes.forEach(button => button.addEventListener("click", () => {
    mode = button.dataset.mode;
    const signup = mode === "signup";
    host.querySelector("h2").textContent = signup ? "Create your account" : "Log in to Collavibe";
    host.querySelector("[data-name]").hidden = !signup;
    form.elements.name.required = signup;
    form.elements.password.autocomplete = signup ? "new-password" : "current-password";
    host.querySelector("[data-hint]").hidden = !signup;
    submit.textContent = signup ? "Create account" : "Log in";
    modes.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    error.textContent = "";
  }));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    modes.forEach(button => { button.disabled = true; });
    error.textContent = "";
    submit.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
    try {
      const response = await fetch("/api/auth/" + mode, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to sign in. Try again.");
      form.reset();
      announceAuthChange();
      await onSuccess();
    } catch (caught) {
      error.textContent = caught.name === "TimeoutError" ? "Sign-in timed out. Please try again." : caught.message;
    } finally {
      submit.disabled = false;
      modes.forEach(button => { button.disabled = false; });
      submit.textContent = mode === "signup" ? "Create account" : "Log in";
    }
  });
}

export function announceAuthChange() {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel("collavibe-auth");
  channel.postMessage("changed");
  channel.close();
}

// Recheck the server cookie when returning to a tab, including back/forward cache.
let stopWatching;
export function watchSession(authenticated) {
  stopWatching?.();
  let pending = false;
  async function check() {
    if (document.hidden || pending) return;
    pending = true;
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
      if (response.ok && (await response.json()).authenticated !== authenticated) location.reload();
    } catch { /* Keep the current page during a temporary connection failure. */ }
    finally { pending = false; }
  }
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("collavibe-auth") : null;
  if (channel) channel.onmessage = check;
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
  document.addEventListener("visibilitychange", check);
  stopWatching = () => {
    channel?.close();
    window.removeEventListener("focus", check);
    window.removeEventListener("pageshow", check);
    document.removeEventListener("visibilitychange", check);
  };
}
