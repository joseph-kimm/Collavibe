import { escape as e } from "./portfolio-content.js";
const status=document.getElementById("examples-status");
const host=document.getElementById("example-projects");
function link(path,label) {
  return /^\/(p\/portfolio_[a-f0-9-]{36}|course\/portfolio\/learner_[a-f0-9]{64}|blog#post_[a-f0-9-]{36}|forum#post_[a-f0-9-]{36})$/.test(path)
    ? `<a href="${e(path)}">${e(label)}</a>` : "";
}
async function load() {
  try {
    const response=await fetch("/examples.json");
    if(!response.ok)throw Error("Examples could not be loaded. Please try again.");
    const {projects}=await response.json();
    host.innerHTML=projects.map(p=>`<section class="course-story"><p class="overline">Demo team · ${e(p.team)}</p><h2>${e(p.name)}</h2><p>${e(p.description)}</p><p class="subtle">Fictional collaborators · ${p.people.map(e).join(", ")}</p><div class="form-actions">${link(p.portfolio,"Explore the project history")}${link(p.learnerPortfolio,"Read a learner portfolio")}</div><h3>From the team’s blog</h3><ul>${p.stories.map((path,i)=>`<li>${link(path,i===0?"The first design decision":"What the team would try next")}</li>`).join("")}</ul><h3>Join a public conversation</h3><ul>${p.threads.map((path,i)=>`<li>${link(path,["A build update","A design question","A comparison and trade-off"][i])}</li>`).join("")}</ul></section>`).join("");
    status.textContent="Three fictional teams, with linked project histories, stories, and conversations.";
  }catch(error){status.textContent=error.message;host.innerHTML='<button class="button" type="button">Try again</button>';host.querySelector("button").addEventListener("click",load);}
}
load();
