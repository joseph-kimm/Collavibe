import { escape, portfolioContent } from "./portfolio-content.js";
const id = location.pathname.split("/").filter(Boolean)[1];
const endpoint = "/api/public/portfolios/" + encodeURIComponent(id || "");
const $ = id => document.getElementById(id);
let data, permissions;
async function api(path, options = {}) { const response = await fetch(path,{ cache:"no-store",...options,headers:{ "Content-Type":"application/json",...options.headers } }); const result=await response.json(); if(!response.ok)throw new Error(result.error||"The request failed."); return result; }
async function load() {
  try {
    data = await api(endpoint);
    $("public-portfolio-title").textContent = data.snapshot.title;
    $("public-portfolio-content").innerHTML = portfolioContent(data.snapshot);
    $("portfolio-status").textContent = "A public snapshot selected by the team. Private workspace access is not included.";
    $("portfolio-feedback").hidden = false;
    const auth = await api("/api/auth/status");
    permissions = auth.authenticated ? await api(endpoint + "/permissions") : null;
    $("public-feedback-account").innerHTML = permissions ? `<p>Posting as ${escape(permissions.name)}. Your feedback and display name will be public.</p>` : `<p><a class="button" href="/login?returnTo=${encodeURIComponent(location.pathname)}">Log in to give feedback</a></p>`;
    $("public-feedback-form").hidden = !permissions;
    $("public-feedback-form").elements.sessionId.innerHTML = '<option value="">The project overall</option>' + data.snapshot.sessions.map(session => `<option value="${escape(session.id)}">${escape(session.participant)}: ${escape(session.summary.slice(0,80) || "Building session")}</option>`).join("");
    $("public-feedback-list").innerHTML = data.feedback.map(row => `<article class="ticket-row"><div class="comment-heading"><strong>${escape(row.authorName)}</strong><time>${escape(new Date(row.createdAt).toLocaleString())}</time></div><p class="subtle">${row.sessionId ? "About a building session" : "About the project"}${row.parentId ? " · Reply in a discussion" : ""}</p><p class="learning-text">${escape(row.text)}</p>${permissions ? `<button class="text-button" type="button" data-reply-feedback="${escape(row.id)}">Reply</button>` : ""}${permissions?.removableIds.includes(row.id) ? `<button class="text-button" type="button" data-remove-feedback="${escape(row.id)}">Remove feedback</button>` : ""}</article>`).join("") || '<p class="subtle">No public feedback yet.</p>';
    document.querySelectorAll("[data-reply-feedback]").forEach(button=>button.addEventListener("click",()=>{ const row=data.feedback.find(row=>row.id===button.dataset.replyFeedback); const form=$("public-feedback-form"); form.elements.parentId.value=row.id; form.elements.sessionId.value=row.sessionId||""; form.elements.text.focus(); }));
    document.querySelectorAll("[data-remove-feedback]").forEach(button=>button.addEventListener("click",async()=>{ button.disabled=true; try{await api(endpoint+"/feedback/"+encodeURIComponent(button.dataset.removeFeedback),{method:"DELETE"}); await load();}catch(error){$("portfolio-status").textContent=error.message;button.disabled=false;} }));
  } catch(error) { $("portfolio-status").textContent=error.message; $("public-portfolio-title").textContent="Portfolio unavailable"; $("public-portfolio-content").replaceChildren(); $("portfolio-feedback").hidden=true; }
}
$("public-feedback-form").addEventListener("submit",async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');if(button.disabled)return;button.disabled=true;
  try{await api(endpoint+"/feedback",{method:"POST",body:JSON.stringify({text:form.elements.text.value,sessionId:form.elements.sessionId.value||null,parentId:form.elements.parentId.value||null,publicConsent:form.elements.publicConsent.checked})});form.reset();await load();}
  catch(error){form.querySelector(".form-error").textContent=error.message;}finally{button.disabled=false;}
});
$("public-feedback-form").elements.sessionId.addEventListener("change",()=>{$("public-feedback-form").elements.parentId.value="";});
load();
