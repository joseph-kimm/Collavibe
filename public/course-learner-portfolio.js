import { api, courseContext } from "./course.js";
import { escape as e } from "./portfolio-content.js";
import { learnerPortfolioMarkup, projectSlots } from "./learner-portfolio-content.js";

const host = document.getElementById("learner-portfolio-editor");
let generation = 0;

function field(name, label, value, limit, options = {}) {
  const required = options.optional ? "" : "required";
  const text = e(value || "");
  return `<label>${label}${options.multiline
    ? `<textarea name="${name}" rows="3" maxlength="${limit}" ${required}>${text}</textarea>`
    : `<input name="${name}" type="${options.type || "text"}" maxlength="${limit}" value="${text}" ${required} />`}</label>`;
}

async function start() {
  const run = ++generation;
  const { account, teamId } = courseContext();
  if (!teamId) {
    host.innerHTML = account
      ? '<p>Join your cohort team to start your portfolio.</p><a href="/?returnTo=%2Fcourse%23learner-portfolio&setupTeam=1">Join your cohort</a>'
      : '<p>Sign in to save a private project portfolio.</p><a class="button primary" href="/course#course-account">Sign in</a>';
    return;
  }
  const endpoint = `/api/course/teams/${encodeURIComponent(teamId)}/learner-portfolio`;
  host.innerHTML = '<p role="status">Loading your portfolio…</p>';
  let current;
  try {
    ({ portfolio: current } = await api(endpoint));
  } catch (error) {
    if (run !== generation) return;
    host.innerHTML = `<p role="alert">${e(error.message)}</p><button type="button" class="button quiet">Try again</button>`;
    host.querySelector("button").addEventListener("click", start);
    return;
  }
  if (run !== generation) return;
  const content = current?.content || { title: "My Vibecode 101 projects", introduction: "", projects: [] };
  host.innerHTML = `
    <p class="cohort-label">Private workspace · ${e(account.teams.find(team => team.id === teamId)?.name)} · <a href="#course-account">Change team</a></p>
    <form class="form learner-portfolio-form">
      ${field("title", "Portfolio title", content.title, 140)}
      ${field("introduction", "Introduction (optional)", content.introduction, 1200, { optional: true, multiline: true })}
      ${projectSlots.map(([id, label]) => {
        const project = content.projects.find(row => row.assignmentId === id);
        return `<details class="portfolio-slot" data-project="${id}">
          <summary>${e(label)}<small>${project ? e(project.title) : "Add project notes"}</small></summary>
          <label class="checkbox-label"><input type="checkbox" data-include ${project ? "checked" : ""} />Include this project</label>
          <fieldset ${project ? "" : "disabled hidden"}>
            <legend>Project details</legend>
            ${field("projectTitle", "Project title", project?.title, 140)}
            ${field("problem", "Who is it for and what problem does it solve?", project?.problem, 1000, { multiline: true })}
            ${field("tools", "Tools and technologies", project?.tools, 600, { multiline: true })}
            ${field("decision", "A decision you made and why", project?.decision, 1600, { multiline: true })}
            ${field("evidence", "What you checked or changed", project?.evidence, 1200, { multiline: true })}
            ${field("projectUrl", "Project link (optional)", project?.projectUrl, 2048, { type: "url", optional: true })}
            ${field("demoUrl", "Video demo link (optional)", project?.demoUrl, 2048, { type: "url", optional: true })}
          </fieldset>
        </details>`;
      }).join("")}
      <div class="form-actions">
        <button class="button primary" type="submit">Save private portfolio</button>
        <button class="button" type="button" data-preview>Preview saved page</button>
      </div>
    </form>
    <div class="portfolio-sharing"></div>
    <p class="portfolio-status" role="status"></p>
    <div class="portfolio-preview"></div>`;

  const form = host.querySelector("form");
  const status = host.querySelector(".portfolio-status");
  const sharing = host.querySelector(".portfolio-sharing");
  const preview = host.querySelector(".portfolio-preview");
  const previewButton = form.querySelector("[data-preview]");
  const slots = [...form.querySelectorAll("[data-project]")];
  let dirty = false;
  let busy = false;
  let editRevision = 0;

  function sharingStatus() {
    previewButton.disabled = dirty || busy || !current?.content.projects.length;
    sharing.innerHTML = current?.publicId
      ? `<p>A reviewed version is public. Draft edits stay private until you publish again.</p>
        <div class="course-links"><a href="/course/portfolio/${e(current.publicId)}" target="_blank" rel="noopener noreferrer">Open public portfolio</a>
        <button class="button quiet" type="button" data-unpublish>Unpublish</button></div>`
      : "<p>Only you can see this saved draft. Preview it when you want to review a shareable page.</p>";
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
      if (run === generation) previewButton.disabled = dirty || !current?.content.projects.length;
    }
  }

  for (const slot of slots) {
    const toggle = slot.querySelector("[data-include]");
    toggle.addEventListener("change", () => {
      const fields = slot.querySelector("fieldset");
      fields.disabled = fields.hidden = !toggle.checked;
      if (toggle.checked) fields.querySelector("input").focus();
    });
  }
  form.addEventListener("input", () => {
    editRevision++;
    dirty = true;
    previewButton.disabled = true;
    preview.replaceChildren();
    status.textContent = "Save your edits to preview them.";
  });
  form.addEventListener("invalid", event => {
    const slot = event.target.closest(".portfolio-slot");
    if (slot) slot.open = true;
  }, true);
  form.addEventListener("submit", event => {
    event.preventDefault();
    perform(event.submitter, async () => {
      const savedRevision = editRevision;
      const values = new FormData(form);
      const projects = slots.filter(slot => slot.querySelector("[data-include]").checked).map(slot => {
        const value = name => slot.querySelector(`[name="${name}"]`).value;
        return {
          assignmentId: slot.dataset.project, title: value("projectTitle"), problem: value("problem"),
          tools: value("tools"), decision: value("decision"), evidence: value("evidence"),
          projectUrl: value("projectUrl"), demoUrl: value("demoUrl"),
        };
      });
      const result = await api(endpoint, {
        method: "PUT",
        body: JSON.stringify({ title: values.get("title"), introduction: values.get("introduction"), projects, expectedVersion: current?.version }),
      });
      if (run !== generation) return;
      current = result.portfolio;
      dirty = savedRevision !== editRevision;
      preview.replaceChildren();
      for (const slot of slots) {
        const project = projects.find(row => row.assignmentId === slot.dataset.project);
        slot.querySelector("summary small").textContent = project?.title || "Add project notes";
      }
      sharingStatus();
      status.textContent = dirty
        ? "Saved the previous version. Save again to keep your newer edits."
        : `Saved privately. ${projects.length} of 4 projects included.`;
    });
  });
  previewButton.addEventListener("click", () => perform(previewButton, async () => {
    const reviewed = await api(endpoint + "/preview");
    if (run !== generation || dirty) return;
    preview.innerHTML = `<p class="thread-meta">Publication preview</p>${learnerPortfolioMarkup(reviewed.snapshot)}
      <form class="form portfolio-publish">
        <label class="checkbox-label"><input name="consent" type="checkbox" required />I reviewed the page and links and have permission to share everything shown with my display name.</label>
        <button class="button primary" type="submit">Publish portfolio</button>
      </form>`;
    preview.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      perform(event.submitter, async () => {
        const result = await api(endpoint + "/publish", {
          method: "POST",
          body: JSON.stringify({ expectedVersion: reviewed.version, previewHash: reviewed.previewHash, consent: event.target.elements.consent.checked }),
        });
        if (run !== generation) return;
        current = result.portfolio;
        preview.replaceChildren();
        sharingStatus();
        status.textContent = "Your reviewed portfolio is public. Use Open public portfolio to get its link.";
      });
    });
  }));
  sharing.addEventListener("click", event => {
    const button = event.target.closest("[data-unpublish]");
    if (!button) return;
    perform(button, async () => {
      const result = await api(endpoint + "/unpublish", { method: "POST", body: JSON.stringify({ expectedVersion: current.version }) });
      if (run !== generation) return;
      current = result.portfolio;
      preview.replaceChildren();
      sharingStatus();
      status.textContent = "Portfolio unpublished. Your private draft is still saved.";
    });
  });
  sharingStatus();
}

document.addEventListener("course-ready", start);
document.addEventListener("course-team-change", start);
