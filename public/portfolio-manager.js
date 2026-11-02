import { escape, portfolioContent } from "./portfolio-content.js";

export async function mountPortfolioManager(host, context) {
  const { api, copy, teamId, projectId, features, sessions, owner, isCurrent } = context;
  const endpoint = `/api/teams/${encodeURIComponent(teamId)}/projects/${encodeURIComponent(projectId)}/portfolios`;
  let rows = [], preview = null, fields;
  const current = () => host.isConnected && isCurrent();
  async function load() { const data = await api(endpoint); if (!current()) return; rows = data.portfolios; render(); }
  function render() {
    if (!current()) return;
    host.innerHTML = `<div class="collaboration-page"><div class="collaboration-intro"><h2>Share the process, on purpose</h2><p>A portfolio is a reviewed public snapshot, not access to your private workspace. Nothing is shared until the team owner previews and publishes it.</p></div><section class="portfolio-links"><h3>Shared portfolios</h3>${rows.map(row => `<article class="ticket-row"><h4>${escape(row.title)}</h4><p>${row.published ? "Shared publicly" : "Sharing revoked"}</p>${row.published ? `<div class="form-actions"><a class="button" href="/p/${escape(row.id)}" target="_blank" rel="noopener noreferrer">View portfolio</a><button class="button" type="button" data-copy-portfolio="${escape(row.id)}">Copy public link</button>${owner ? `<button class="button" type="button" data-revoke-portfolio="${escape(row.id)}">Revoke sharing</button>` : ""}</div>` : ""}</article>`).join("") || '<p class="subtle">No public portfolio yet.</p>'}</section>${owner ? `<form class="form portfolio-form"><h3>Prepare a portfolio</h3><label>Portfolio title<input name="title" minlength="3" maxlength="200" value="${escape(context.projectName)}" required/></label><label>Introduction<textarea name="description" rows="3" minlength="12" maxlength="4000" required></textarea></label><label>Live project link, optional<input name="appUrl" type="url" placeholder="https://"/></label><fieldset><legend>Choose features to share</legend>${features.map(feature => `<label class="checkbox-label"><input type="checkbox" name="featureIds" value="${escape(feature.id)}"/>${escape(feature.title)}</label>`).join("") || '<p class="subtle">No features yet.</p>'}</fieldset><fieldset><legend>Choose building sessions to share</legend>${sessions.map(session => `<label class="checkbox-label"><input type="checkbox" name="sessionIds" value="${escape(session.id)}"/>${escape(session.participant)}: ${escape(session.intent || session.sync?.summary?.slice(0,100) || "Building session")}</label>`).join("") || '<p class="subtle">No sessions yet.</p>'}</fieldset><label class="checkbox-label"><input type="checkbox" name="includeReflections"/>Include only reflections whose authors have allowed public sharing</label><p class="subtle">Meeting transcripts, intake answers, private replies, account details, and internal file paths are excluded. Review the complete preview for any remaining sensitive information.</p><p class="form-error" role="alert"></p><button class="button" type="submit">Preview public content</button></form><section class="portfolio-preview" hidden><h3>Review exactly what will be public</h3><h2 class="portfolio-preview-title"></h2><div class="portfolio-preview-body"></div><label class="checkbox-label"><input type="checkbox" data-publish-consent/>I reviewed this content and confirmed the participants agree to making it public</label><button class="button primary" type="button" data-publish-portfolio disabled>Publish this portfolio</button></section>` : '<p class="subtle">Only the team owner can prepare, publish, or revoke sharing.</p>'}<p class="collaboration-status" role="status"></p></div>`;
    const form = host.querySelector(".portfolio-form");
    form?.addEventListener("input", () => { preview = null; host.querySelector('[data-publish-portfolio]').disabled = true; host.querySelector('.portfolio-preview').hidden = true; });
    form?.addEventListener("submit", async event => {
      event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
      const data = new FormData(form); fields = { title: data.get("title"), description: data.get("description"), appUrl: data.get("appUrl"), featureIds: data.getAll("featureIds"), sessionIds: data.getAll("sessionIds"), includeReflections: data.has("includeReflections") };
      try {
        preview = await api(endpoint + "/preview", { method: "POST", body: JSON.stringify(fields) }); if (!current()) return;
        host.querySelector(".portfolio-preview-title").textContent = preview.snapshot.title;
        host.querySelector(".portfolio-preview-body").innerHTML = portfolioContent(preview.snapshot);
        host.querySelector(".portfolio-preview").hidden = false;
        host.querySelector("[data-publish-consent]").checked = false;
      } catch (error) { form.querySelector(".form-error").textContent = error.message; }
      finally { button.disabled = false; }
    });
    host.querySelector("[data-publish-consent]")?.addEventListener("change", event => { host.querySelector("[data-publish-portfolio]").disabled = !event.target.checked || !preview; });
    host.querySelector("[data-publish-portfolio]")?.addEventListener("click", async event => {
      if (!preview || !host.querySelector("[data-publish-consent]").checked) return;
      event.target.disabled = true;
      try { await api(endpoint, { method: "POST", body: JSON.stringify({ ...fields, previewHash: preview.previewHash, consentConfirmed: true }) }); await load(); if (current()) host.querySelector(".collaboration-status").textContent = "Portfolio published. Only the reviewed snapshot is public; you can revoke it above."; }
      catch (error) { host.querySelector(".collaboration-status").textContent = error.message; event.target.disabled = false; }
    });
    host.querySelectorAll("[data-copy-portfolio]").forEach(button => button.addEventListener("click", () => copy(location.origin + "/p/" + button.dataset.copyPortfolio).catch(error => { host.querySelector(".collaboration-status").textContent = error.message; })));
    host.querySelectorAll("[data-revoke-portfolio]").forEach(button => button.addEventListener("click", async () => {
      const row = rows.find(row => row.id === button.dataset.revokePortfolio); button.disabled = true;
      try { await api(endpoint + "/" + encodeURIComponent(row.id) + "/revoke", { method: "POST", body: JSON.stringify({ expectedVersion: row.version }) }); await load(); }
      catch (error) { button.disabled = false; host.querySelector(".collaboration-status").textContent = error.message; }
    }));
  }
  host.innerHTML = '<div class="collaboration-page" role="status">Loading portfolio settings…</div>';
  try { await load(); } catch (error) { if (current()) { host.innerHTML = '<div class="collaboration-page"><p class="form-error" role="alert"></p></div>'; host.querySelector("p").textContent = error.message; } }
}
