import { api } from "./course-api.js";
import { escape as e, safeHref } from "./portfolio-content.js";
const host=document.getElementById("blog-stories");
const status=document.getElementById("blog-status");
const search=document.getElementById("blog-search");
let stories=[];
function render() {
  const term=search.value.trim().toLowerCase();
  const matches=stories.filter(row=>[row.title,row.body,row.authorName].join(" ").toLowerCase().includes(term));
  host.innerHTML=matches.map(row=>{
    const demo=safeHref(row.demoUrl);
    const portfolio=/^portfolio_[a-f0-9-]{36}$/.test(row.portfolioId) ? "/p/"+row.portfolioId : "";
    return `<article class="course-story" id="${e(row.id)}"><h2><a href="#${e(row.id)}">${e(row.title)}</a></h2><p class="subtle">${e(row.authorName)} · ${e(new Date(row.publishedAt).toLocaleDateString())}</p><p class="course-story-body">${e(row.body)}</p><div class="form-actions">${demo?`<a href="${e(demo)}" target="_blank" rel="noopener noreferrer">Watch demo or try project</a>`:""}${portfolio?`<a href="${portfolio}">Read project portfolio</a>`:""}<a href="/forum">Join the public discussion</a></div></article>`;
  }).join("");
  status.textContent=matches.length ? `${matches.length} published ${matches.length===1?"story":"stories"}` : stories.length ? "No matching stories. Try another search." : "No stories have been published yet. Authors can write and publish from the course page.";
}
search.addEventListener("input",render);
async function load() {
  try {
    stories=(await api("/api/course/stories")).stories;
    render();
    const target=location.hash.slice(1);
    if (/^post_[a-f0-9-]{36}$/.test(target)) {
      const article=document.getElementById(target);
      if(article)article.scrollIntoView({block:"start"});
      else status.textContent="This story is no longer published.";
    }
  } catch(error) {
    status.textContent=error.message;
    host.innerHTML='<button class="button" type="button">Try again</button>';
    host.querySelector("button").addEventListener("click",load);
  }
}
load();
