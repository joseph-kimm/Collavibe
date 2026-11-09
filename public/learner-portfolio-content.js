import { escape as e, safeHref } from "./portfolio-content.js";

export const projectSlots = [
  ["first-build", "First prototype"],
  ["two-api", "Two-API app"],
  ["reliable-data", "Data and access"],
  ["final-project", "Final team project"],
];

export function learnerPortfolioMarkup(portfolio) {
  return `<div class="learner-portfolio-sheet">
    ${portfolio.authorName ? `<p class="thread-meta">${e(portfolio.authorName)} · Vibecode 101</p>` : ""}
    <h2>${e(portfolio.title)}</h2>
    ${portfolio.introduction ? `<p class="course-story-body">${e(portfolio.introduction)}</p>` : ""}
    ${projectSlots.map(([id, label]) => {
      const project = portfolio.projects.find(entry => entry.assignmentId === id);
      if (!project) return "";
      const app = safeHref(project.projectUrl);
      const demo = safeHref(project.demoUrl);
      return `<article class="learner-project">
        <p class="thread-meta">${e(label)}</p>
        <h3>${e(project.title)}</h3>
        <dl>
          <dt>Problem</dt><dd>${e(project.problem)}</dd>
          <dt>Tools</dt><dd>${e(project.tools)}</dd>
          <dt>Decision</dt><dd>${e(project.decision)}</dd>
          <dt>What I checked</dt><dd>${e(project.evidence)}</dd>
        </dl>
        <div class="course-links">
          ${app ? `<a href="${e(app)}" target="_blank" rel="noopener noreferrer">Open project</a>` : ""}
          ${demo ? `<a href="${e(demo)}" target="_blank" rel="noopener noreferrer">Watch demo</a>` : ""}
        </div>
      </article>`;
    }).join("")}
  </div>`;
}
