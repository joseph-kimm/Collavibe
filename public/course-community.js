import { api, courseContext } from "./course.js";
import { escape as e, safeHref } from "./portfolio-content.js";

const host = document.getElementById("course-discussions");
const categories = { update: "Build update", question: "Ask for experience", comparison: "Tool comparison" };
let generation = 0;

function displayDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function removalControl(row, label) {
  if (!row.canRemove) return "";
  return `<details class="community-remove">
    <summary>${label}</summary>
    <button type="button" class="button quiet" data-remove="${e(row.id)}" data-version="${row.version}">Confirm removal</button>
  </details>`;
}

async function start() {
  const run = ++generation;
  const { account, teamId } = courseContext();
  if (!teamId) {
    host.innerHTML = account
      ? '<p>Join your cohort team to read and post in its forum.</p><a href="/">Open workspace</a>'
      : '<p>Sign in and join your cohort team to participate.</p><a class="button primary" href="/?returnTo=%2Fcourse%23community">Sign in</a>';
    return;
  }
  const teamName = account.teams.find(team => team.id === teamId)?.name;
  const endpoint = `/api/course/teams/${encodeURIComponent(teamId)}/discussions`;
  host.innerHTML = `
    <p class="cohort-label">Visible to members of <strong>${e(teamName)}</strong> · <a href="#course-account">Change team</a></p>
    <details class="community-compose">
      <summary>Start a discussion</summary>
      <form class="form community-post-form">
        <label>Post type<select name="category">${Object.entries(categories).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        <label>Title<input name="title" minlength="4" maxlength="140" required /></label>
        <label>Your post<textarea name="body" rows="5" minlength="12" maxlength="4000" placeholder="What did you try, what happened, and what input would help?" required></textarea></label>
        <label>Evidence or demo link (optional)<input name="evidenceUrl" type="url" maxlength="2048" placeholder="https://" /></label>
        <button class="button primary" type="submit">Post to cohort</button>
      </form>
    </details>
    <div class="community-toolbar">
      <label>Show <select class="community-filter"><option value="">All discussions</option>${Object.entries(categories).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
      <button type="button" class="button quiet community-refresh">Refresh</button>
    </div>
    <p class="community-status" role="status"></p>
    <div class="community-list"></div>`;
  const status = host.querySelector(".community-status");
  const list = host.querySelector(".community-list");
  const filter = host.querySelector(".community-filter");
  const compose = host.querySelector(".community-compose");
  let threads = [];
  const replyDrafts = new Map();
  let count = 15;
  let busy = false;

  function render(openIds = []) {
    const matches = threads.filter(thread => !filter.value || thread.category === filter.value);
    list.innerHTML = matches.slice(0, count).map(thread => {
      const url = safeHref(thread.evidenceUrl);
      return `<article class="community-thread" data-thread="${e(thread.id)}">
        <p class="thread-meta">${e(categories[thread.category])} · ${e(thread.authorName)} · ${e(displayDate(thread.createdAt))}</p>
        <h3>${e(thread.title)}</h3>
        <p class="course-story-body">${e(thread.body)}</p>
        ${url ? `<p><a href="${e(url)}" target="_blank" rel="noopener noreferrer">Open evidence or demo</a></p>` : ""}
        <details class="community-replies" ${openIds.includes(thread.id) ? "open" : ""}>
          <summary>${thread.replies.length ? `${thread.replies.length} ${thread.replies.length === 1 ? "reply" : "replies"}` : "Reply"}</summary>
          <div class="community-reply-list">
            ${thread.replies.map(reply => `<div class="community-reply">
              <p class="thread-meta">${e(reply.authorName)} · ${e(displayDate(reply.createdAt))}</p>
              <p class="course-story-body">${e(reply.body)}</p>
              ${removalControl(reply, "Remove reply")}
            </div>`).join("")}
          </div>
          <form class="form community-reply-form">
            <label>Your reply<textarea name="body" rows="3" minlength="3" maxlength="2500" placeholder="Share a result, trade-off, or question from your own experience." required>${e(replyDrafts.get(thread.id) || "")}</textarea></label>
            <button class="button primary" type="submit">Post reply</button>
          </form>
        </details>
        ${removalControl(thread, "Remove discussion")}
      </article>`;
    }).join("") || '<p class="community-empty">No discussions here yet. Share a result or ask what worked for someone else.</p>';
    if (matches.length > count) list.insertAdjacentHTML("beforeend", '<button class="button quiet" type="button" data-more>Show more discussions</button>');
  }

  async function refresh(message = "", keepOpen) {
    const openIds = keepOpen ?? [...list.querySelectorAll(".community-replies[open]")].map(row => row.closest("[data-thread]").dataset.thread);
    const result = await api(endpoint);
    if (run !== generation) return;
    threads = result.threads;
    render(openIds);
    status.textContent = message;
  }

  async function perform(control, action) {
    if (busy) return;
    busy = true;
    control.disabled = true;
    status.textContent = "";
    try {
      await action();
    } catch (error) {
      if (run === generation) status.textContent = error.message;
    } finally {
      busy = false;
      control.disabled = false;
    }
  }

  const post = compose.querySelector("form");
  post.addEventListener("submit", event => {
    event.preventDefault();
    perform(event.submitter, async () => {
      await api(endpoint, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(post))) });
      post.reset();
      compose.open = false;
      filter.value = "";
      await refresh("Discussion posted.");
    });
  });
  list.addEventListener("input", event => {
    if (event.target.matches(".community-reply-form textarea")) {
      replyDrafts.set(event.target.closest("[data-thread]").dataset.thread, event.target.value);
    }
  });
  list.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    const threadId = form.closest("[data-thread]").dataset.thread;
    perform(event.submitter, async () => {
      await api(`${endpoint}/${encodeURIComponent(threadId)}/replies`, {
        method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      replyDrafts.delete(threadId);
      await refresh("Reply posted.");
    });
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-more")) {
      count += 15;
      render([...list.querySelectorAll(".community-replies[open]")].map(row => row.closest("[data-thread]").dataset.thread));
      return;
    }
    if (!button.dataset.remove) return;
    const threadId = button.closest("[data-thread]").dataset.thread;
    const suffix = button.dataset.remove === threadId ? "" : `/replies/${encodeURIComponent(button.dataset.remove)}`;
    perform(button, async () => {
      await api(`${endpoint}/${encodeURIComponent(threadId)}${suffix}`, {
        method: "DELETE", body: JSON.stringify({ expectedVersion: Number(button.dataset.version) }),
      });
      await refresh("Removed from the cohort forum.");
    });
  });
  filter.addEventListener("change", () => { count = 15; render(); });
  host.querySelector(".community-refresh").addEventListener("click", event => perform(event.currentTarget, () => refresh("Forum refreshed.")));
  status.textContent = "Loading discussions…";
  try { await refresh(); } catch (error) { if (run === generation) status.textContent = error.message; }
}

document.addEventListener("course-ready", start);
document.addEventListener("course-scope-change", start);
