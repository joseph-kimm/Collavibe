import { api, courseContext } from "./course.js";
import { escape as e, safeHref } from "./portfolio-content.js";

const $ = id => document.getElementById(id);
const drafts = new Map();
let publicLoad = 0;
let editorLoad = 0;

function storyMarkup(row) {
  const demoUrl = safeHref(row.demoUrl);
  const projectUrl = /^portfolio_[a-f0-9-]{36}$/.test(row.portfolioId) ? "/p/" + row.portfolioId : "";
  return `<article class="course-story">
    <h3>${e(row.title)}</h3>
    <p class="subtle">${e(row.authorName)}${row.publishedAt ? " · " + e(new Date(row.publishedAt).toLocaleDateString()) : ""}</p>
    <p class="course-story-body">${e(row.body)}</p>
    <div class="form-actions">
      ${demoUrl ? `<a href="${e(demoUrl)}" target="_blank" rel="noopener noreferrer">Watch demo or try project</a>` : ""}
      ${projectUrl ? `<a href="${e(projectUrl)}">Read project portfolio</a>` : ""}
    </div>
  </article>`;
}

async function publicStories() {
  const run = ++publicLoad;
  const host = $("course-stories");
  try {
    const result = await api("/api/course/stories");
    if (run === publicLoad) host.innerHTML = result.stories.map(storyMarkup).join("") || "<p>No stories have been shared yet.</p>";
  } catch (error) {
    if (run === publicLoad) host.textContent = error.message;
  }
}

async function editor(selectedId = null, message = "") {
  const run = ++editorLoad;
  const { account, teamId } = courseContext();
  const host = $("course-story-editor");
  if (!account || !teamId) {
    host.replaceChildren();
    return;
  }
  host.innerHTML = '<p role="status">Loading your stories…</p>';
  const base = `/api/course/teams/${encodeURIComponent(teamId)}/stories`;
  const current = () => run === editorLoad && teamId === courseContext().teamId;
  try {
    const { stories, portfolios } = await api(base);
    if (!current()) return;
    host.innerHTML = `<h3>Your course stories</h3>
      <p>Write about a decision, a failed attempt, or something your team learned.</p>
      <label class="course-account-picker">Story<select id="story-picker">
        <option value="">New story</option>
        ${stories.map(row => `<option value="${e(row.id)}">${e(row.payload.title)} · ${row.payload.published ? "Public" : "Draft"}${row.authorId === account.id ? "" : " · " + e(row.authorName)}</option>`).join("")}
      </select></label>
      <p id="story-status" role="status"></p><div id="story-form-host"></div>`;
    $("story-status").textContent = message;
    const picker = $("story-picker");
    picker.value = stories.some(row => row.id === selectedId) ? selectedId : "";
    const choose = () => {
      $("story-status").textContent = "";
      renderForm(stories.find(row => row.id === picker.value));
    };
    picker.addEventListener("change", choose);
    renderForm(stories.find(row => row.id === picker.value));

    function renderForm(row) {
      const formHost = $("story-form-host");
      const path = row ? base + "/" + encodeURIComponent(row.id) : base;
      if (row && row.authorId !== account.id) {
        formHost.innerHTML = storyMarkup({ ...row.payload, authorName: row.authorName }) +
          '<button class="button quiet" type="button">Unpublish as organizer</button>';
        const button = formHost.querySelector("button");
        button.addEventListener("click", () => act(button, async () => {
          await api(path + "/unpublish", { method: "POST", body: JSON.stringify({ expectedVersion: row.version }) });
          if (current() && button.isConnected) await editor(null, "Story unpublished.");
          await publicStories();
        }));
        return;
      }
      const key = [account.id, teamId, row?.id || "new"].join(":");
      const payload = drafts.get(key) || row?.payload || {};
      const available = portfolios.some(portfolio => portfolio.id === payload.portfolioId);
      formHost.innerHTML = `<form class="form" id="story-form">
        <label>Title<input name="title" required minlength="3" maxlength="200" value="${e(payload.title || "")}" /></label>
        <label>Your story<textarea name="body" required minlength="20" maxlength="15000" rows="7">${e(payload.body || "")}</textarea></label>
        <label>Demo or project link (optional HTTPS link)<input name="demoUrl" type="url" value="${e(payload.demoUrl || "")}" /></label>
        <label>Published team portfolio (optional)<select name="portfolioId">
          <option value="">${payload.portfolioId && !available ? "Previous portfolio link is unavailable" : "No portfolio link"}</option>
          ${portfolios.map(portfolio => `<option value="${e(portfolio.id)}" ${portfolio.id === payload.portfolioId ? "selected" : ""}>${e(portfolio.title)}</option>`).join("")}
        </select></label>
        <p class="subtle">Save a private draft first. Saving edits to a public story takes it offline until you publish it again.</p>
        <div class="form-actions">
          <button class="button primary" type="submit">Save draft</button>
          ${row ? '<button class="button" id="preview-story" type="button">Preview publication</button>' : ""}
          ${row?.payload.published ? '<button class="button quiet" id="unpublish-story" type="button">Unpublish</button>' : ""}
        </div>
      </form><div id="story-preview"></div>`;
      const form = $("story-form");
      const previewHost = $("story-preview");
      const inView = () => current() && form.isConnected;
      form.addEventListener("input", () => {
        drafts.set(key, Object.fromEntries(new FormData(form)));
        previewHost.replaceChildren();
      });
      form.addEventListener("submit", event => {
        event.preventDefault();
        act(event.submitter, async () => {
          const body = Object.fromEntries(new FormData(form));
          if (row) body.expectedVersion = row.version;
          const result = await api(path, { method: row ? "PATCH" : "POST", body: JSON.stringify(body) });
          if (inView()) {
            drafts.delete(key);
            await editor(result.story.id, "Draft saved. Review it before sharing.");
          }
          await publicStories();
        });
      });
      $("preview-story")?.addEventListener("click", event => act(event.currentTarget, async () => {
        if (drafts.has(key)) throw new Error("Save your changes before previewing.");
        const preview = await api(path + "/preview", { method: "POST", body: "{}" });
        if (!inView() || drafts.has(key)) return;
        previewHost.innerHTML = `<h3>Public preview</h3>${storyMarkup(preview.snapshot)}
          <form class="form">
            <label class="checkbox-label"><input name="consent" type="checkbox" required />I reviewed this story and have permission to share everything shown with my display name.</label>
            <button class="button primary" type="submit">Publish story</button>
          </form>`;
        previewHost.querySelector("form").addEventListener("submit", event => {
          event.preventDefault();
          const consent = event.currentTarget.elements.consent.checked;
          act(event.submitter, async () => {
            const body = { expectedVersion: preview.version, previewHash: preview.previewHash, publicConsent: consent };
            await api(path + "/publish", { method: "POST", body: JSON.stringify(body) });
            if (inView()) await editor(row.id, "Story published.");
            await publicStories();
          });
        });
      }));
      $("unpublish-story")?.addEventListener("click", event => act(event.currentTarget, async () => {
        await api(path + "/unpublish", { method: "POST", body: JSON.stringify({ expectedVersion: row.version }) });
        if (inView()) await editor(row.id, "Story unpublished.");
        await publicStories();
      }));
    }

    async function act(button, action) {
      if (!button || button.disabled) return;
      button.disabled = true;
      const status = $("story-status");
      status.textContent = "";
      try {
        await action();
      } catch (error) {
        if (current() && button.isConnected) status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    }
  } catch (error) {
    if (current()) host.textContent = error.message;
  }
}

document.addEventListener("course-ready", () => editor());
document.addEventListener("course-team-change", () => editor());
publicStories();
