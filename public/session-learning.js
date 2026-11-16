import { reflectionSourceLabel } from "./reflection-source.js";
const drafts = new Map();
const discussionDrafts = new Map();
const escape = (value = "") => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const when = value => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export async function mountSessionLearning(host, context) {
  const { teamId, projectId, sessionId, userId, owner, api, readOnly } = context;
  const endpoint = `/api/teams/${encodeURIComponent(teamId)}/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/learning`;
  const key = [teamId, projectId, sessionId, userId].join(":");
  host.innerHTML = '<h3>Learning journal</h3><p class="subtle" role="status">Loading reflections…</p>';
  let records = [];
  async function refresh() {
    const next = await api(endpoint);
    if (!host.isConnected) return;
    records = next.records;
    render();
  }
  function render() {
    if (!host.isConnected) return;
    const own = records.find(row => row.kind === "reflection" && row.authorId === userId);
    const pending = drafts.get(key);
    const draft = pending?.text ?? own?.payload.text ?? "";
    const consent = pending?.publicConsent ?? own?.payload.publicConsent ?? false;
    const authorship = pending?.authorship ?? own?.payload.authorship ?? "unspecified";
    const roots = records.filter(row => row.kind === "reflection");
    host.innerHTML = `<h3>Learning journal</h3><p class="subtle">Reflect on the session, separately from the agent’s handoff. Label demonstration content so it cannot be mistaken for someone’s learning. What did you learn, question, or change your mind about? This is for learning and discussion, not grading.</p>${!readOnly ? `<form class="form learning-reflection"><label>Your reflection<textarea name="text" rows="5" maxlength="8000" required>${escape(draft)}</textarea></label><label>About this reflection<select name="authorship"><option value="unspecified" ${authorship === "unspecified" ? "selected" : ""}>Authorship not specified</option><option value="personal" ${authorship === "personal" ? "selected" : ""}>I wrote this about my own experience</option><option value="ai_assisted" ${authorship === "ai_assisted" ? "selected" : ""}>My experience, with AI writing assistance</option><option value="synthetic" ${authorship === "synthetic" ? "selected" : ""}>Synthetic or demonstration example</option></select></label><label class="checkbox-label"><input type="checkbox" name="publicConsent" ${consent ? "checked" : ""}/>Allow this reflection in a portfolio the team explicitly publishes</label><small>Off by default. Teammates can read it; public publication is a separate step. You can withdraw this permission.</small><p class="form-error" role="alert"></p><button class="button" type="submit">Save reflection</button></form>` : '<p class="subtle">This project is archived. Reflections are read-only.</p>'}<div class="learning-threads">${roots.map(row => `<article class="learning-thread"><div class="comment-heading"><strong>${escape(row.authorName)}</strong><time datetime="${escape(row.updatedAt)}">${escape(when(row.updatedAt))}</time></div><p class="subtle">${escape(reflectionSourceLabel(row.payload.authorship))}</p><p class="learning-text">${escape(row.payload.text)}</p>${row.payload.publicConsent ? '<p class="subtle">Author allows portfolio inclusion</p>' : '<p class="subtle">Team only</p>'}${records.filter(reply => reply.kind === "reply" && reply.payload.rootId === row.id).map(reply => `<article class="learning-reply"><strong>${escape(reply.authorName)}</strong><p class="learning-text">${escape(reply.payload.text)}</p>${!readOnly ? `<button class="text-button" type="button" data-reply-to="${escape(reply.id)}" data-root="${escape(row.id)}">Reply to ${escape(reply.authorName)}</button>` : ""}${!readOnly && (reply.authorId === userId || owner) ? `<button class="text-button" type="button" data-remove-learning="${escape(reply.id)}">Remove reply</button>` : ""}</article>`).join("")}${!readOnly ? `<form class="form learning-reply-form" data-parent="${escape(row.id)}" data-root="${escape(row.id)}"><label>Reply to ${escape(row.authorName)}<textarea name="text" rows="2" maxlength="2000" required></textarea></label><p class="form-error" role="alert"></p><button class="button compact" type="submit">Post reply</button></form>` : ""}</article>`).join("") || '<p class="subtle">No reflections yet. A session can be one building period inside a longer chat.</p>'}</div>`;
    const discussionRoots = records.filter(row => row.kind === "reply" && row.payload.discussion === true && row.payload.rootId === row.id);
    const commentHtml = row => `<article class="comment"><div class="comment-heading"><strong>${escape(row.authorName)}</strong><time datetime="${escape(row.createdAt)}">${escape(when(row.createdAt))}</time></div><p>${escape(row.payload.text)}</p>${!readOnly && (row.authorId === userId || owner) ? `<button class="text-button" type="button" data-remove-learning="${escape(row.id)}">Remove comment</button>` : ''}</article>`;
    host.insertAdjacentHTML("afterbegin", `<section class="session-discussion"><h3>Session discussion <span class="subtle">${records.filter(row => row.payload.discussion === true).length}</span></h3><p class="subtle">Questions and decisions for your team. These comments stay private and are separate from learning reflections.</p>${discussionRoots.map(row => `<div class="session-comment-thread">${commentHtml(row)}<div class="session-comment-replies">${records.filter(reply => reply.id !== row.id && reply.payload.rootId === row.id).map(commentHtml).join('')}${!readOnly ? `<form class="form learning-reply-form" data-parent="${escape(row.id)}" data-root="${escape(row.id)}"><label>Reply to ${escape(row.authorName)}<textarea name="text" rows="2" maxlength="2000" required></textarea></label><p class="form-error" role="alert"></p><button class="button compact" type="submit">Post reply</button></form>` : ''}</div></div>`).join('') || '<p class="subtle">No comments yet. Ask a question about this handoff.</p>'}${!readOnly ? `<form class="form session-comment-form"><label>Add a session comment<textarea name="text" rows="3" maxlength="2000" required>${escape(discussionDrafts.get(key + ':comment') || '')}</textarea></label><p class="form-error" role="alert"></p><button class="button" type="submit">Post session comment</button></form>` : '<p class="subtle">Restore this project to continue the discussion.</p>'}</section>`);
    const commentForm = host.querySelector('.session-comment-form');
    commentForm?.elements.text.addEventListener('input', () => discussionDrafts.set(key + ':comment', commentForm.elements.text.value));
    commentForm?.addEventListener('submit', event => {
      event.preventDefault();
      submit(commentForm, async () => { await api(endpoint + '/comments', { method:'POST', body:JSON.stringify({text:commentForm.elements.text.value}) }); discussionDrafts.delete(key + ':comment'); });
    });
    const form = host.querySelector(".learning-reflection");
    const remember = () => drafts.set(key, { text: form.elements.text.value, publicConsent: form.elements.publicConsent.checked, authorship: form.elements.authorship.value });
    form?.elements.text.addEventListener("input", remember);
    form?.elements.publicConsent.addEventListener("change", remember);
    form?.elements.authorship.addEventListener("change", remember);
    form?.addEventListener("submit", event => {
      event.preventDefault();
      submit(form, async () => {
        await api(endpoint + "/reflection", { method: "PUT", body: JSON.stringify({ text: form.elements.text.value, publicConsent: form.elements.publicConsent.checked, authorship: form.elements.authorship.value, ...(own ? { expectedVersion: own.version } : {}) }) });
        drafts.delete(key);
      });
    });
    host.querySelectorAll(".learning-reply-form").forEach(form => {
      const draftKey = key + ':reply:' + form.dataset.root;
      const saved = discussionDrafts.get(draftKey);
      if (saved) { form.elements.text.value = saved.text; form.dataset.parent = saved.parent; }
      form.elements.text.addEventListener('input', () => discussionDrafts.set(draftKey, {text:form.elements.text.value, parent:form.dataset.parent}));
      form.addEventListener("submit", event => {
      event.preventDefault();
      submit(form, async () => { await api(endpoint + "/replies", { method: "POST", body: JSON.stringify({ parentId: form.dataset.parent, text: form.elements.text.value }) }); discussionDrafts.delete(draftKey); });
    }); });
    host.querySelectorAll("[data-reply-to]").forEach(button => button.addEventListener("click", () => {
      const form = [...host.querySelectorAll(".learning-reply-form")].find(form => form.dataset.root === button.dataset.root);
      form.dataset.parent = button.dataset.replyTo;
      form.elements.text.focus();
      form.elements.text.placeholder = "Replying to this teammate’s comment";
    }));
    host.querySelectorAll("[data-remove-learning]").forEach(button => button.addEventListener("click", async () => {
      const row = records.find(row => row.id === button.dataset.removeLearning);
      button.disabled = true;
      try { await api(endpoint + "/" + encodeURIComponent(row.id), { method: "DELETE", body: JSON.stringify({ expectedVersion: row.version }) }); await refresh(); }
      catch (error) { button.disabled = false; const message = document.createElement("p"); message.className = "form-error"; message.setAttribute("role", "alert"); message.textContent = error.message; button.after(message); }
    }));
  }
  async function submit(form, action) {
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const error = form.querySelector(".form-error"); error.textContent = "";
    try { await action(); await refresh(); }
    catch (caught) { error.textContent = caught.message; button.disabled = false; }
  }
  try { await refresh(); }
  catch (error) {
    if (!host.isConnected) return;
    host.innerHTML = '<h3>Learning journal</h3><p class="form-error" role="alert"></p><button class="button" type="button">Retry loading reflections</button>';
    host.querySelector("p").textContent = error.message;
    host.querySelector("button").addEventListener("click", () => mountSessionLearning(host, context));
  }
}
