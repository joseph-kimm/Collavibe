import { mountSignIn, watchSession } from "./inline-auth.js";
import { escape as e } from "./portfolio-content.js";
import {renderCurriculum} from "./course-curriculum.js";
import { api, rememberCourseTeam, selectedCourseTeam } from "./course-api.js";
const $=id=>document.getElementById(id);
export { api };
let account, teamId, curriculum;
let intakeLoad = 0;
export const courseContext=()=>({account,teamId,course:curriculum});
async function loadTeam(message = "") {
  const run = ++intakeLoad;
  const selected = teamId;
  $("course-intake").innerHTML="<p role='status'>Loading your response…</p>";$("course-organizer").replaceChildren();
  try {
    const result=await api(`/api/course/teams/${encodeURIComponent(selected)}/intake`);
    if (run !== intakeLoad) return;
    const intake = result.intake;
    const fields=intake?.payload||{};
    $("course-intake").innerHTML=`<h3>Tell your organizer about yourself</h3><p>Your response is visible only to you and this team's owner, acting as course organizer. Teammates, public visitors, and connected agents cannot read it. Do not include sensitive personal information.</p><form id="intake-form" class="form"><label>Programming experience<select name="experience"><option value="new">New to programming</option><option value="some">Some experience</option><option value="experienced">Experienced</option></select></label><label>Your background (optional)<textarea name="background" rows="3" maxlength="2000"></textarea></label><label>What are you interested in building?<textarea name="interests" rows="3" maxlength="2000" required></textarea></label><label>What would you like to learn?<textarea name="goals" rows="3" maxlength="2000" required></textarea></label><label>What support would help? (optional)<textarea name="support" rows="3" maxlength="2000"></textarea></label><label>An app or example you like (optional HTTPS link)<input name="exampleUrl" type="url" maxlength="2000"/></label><label class="checkbox-label"><input type="checkbox" name="organizerConsent" required/>Let this team's organizer use my response to prepare and support the course</label><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Save private response</button>${intake?'<button class="button quiet" id="remove-intake" type="button">Remove my response</button>':""}</div><p id="intake-status" role="status"></p></form>`;
    const form=$("intake-form");for(const name of ["experience","background","interests","goals","support","exampleUrl"])if(fields[name])form.elements[name].value=fields[name];form.elements.organizerConsent.checked=fields.organizerConsent===true;
    $("intake-status").textContent = message;
    form.addEventListener("submit",async event=>{event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;form.querySelector('.form-error').textContent="";const payload=Object.fromEntries(new FormData(form));payload.organizerConsent=form.elements.organizerConsent.checked;if(intake)payload.expectedVersion=intake.version;try{await api(`/api/course/teams/${encodeURIComponent(selected)}/intake`,{method:"PUT",body:JSON.stringify(payload)});if(run===intakeLoad)await loadTeam("Your private response is saved.");}catch(error){form.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}});
    $("remove-intake")?.addEventListener("click",async event=>{event.currentTarget.disabled=true;try{await api(`/api/course/teams/${encodeURIComponent(selected)}/intake`,{method:"DELETE",body:JSON.stringify({expectedVersion:intake.version})});if(run===intakeLoad)await loadTeam("Your intake response was removed.");}catch(error){form.querySelector('.form-error').textContent=error.message;event.target.disabled=false;}});
    if(account.teams.find(team=>team.id===selected)?.organizer){const response=await api(`/api/course/teams/${encodeURIComponent(selected)}/intakes`);if(run!==intakeLoad)return;$("course-organizer").innerHTML=`<details><summary>Organizer: ${response.intakes.length} private intake responses</summary>${response.intakes.map(row=>`<article class="course-intake-response"><h3>${e(row.authorName)}</h3>${["experience","background","interests","goals","support","exampleUrl"].map(key=>`<p><strong>${e({experience:"Experience",background:"Background",interests:"Interests",goals:"Learning goals",support:"Support",exampleUrl:"Example"}[key])}</strong></p><p class="course-story-body">${e(row.payload[key]||"Not provided")}</p>`).join("")}</article>`).join("")||"<p>No responses yet.</p>"}</details>`;}
  }catch(error){if(run===intakeLoad)$("course-intake").textContent=error.message;}
}
async function load() {
  try {
    curriculum=await api("/api/course");renderCurriculum(curriculum);
    const auth = await api("/api/auth/status");
    watchSession(auth.authenticated);
    if (!auth.authenticated) {
      mountSignIn($("course-account-content"), { message: "Sign in to join your cohort, submit work, and save your portfolio." });
    }
    else {
      account = await api("/api/course/account");
      $("course-account-content").innerHTML = `<p>Signed in as ${e(account.name)}. <a href="/">Open your workspace</a></p>${account.teams.length
        ? `<label class="course-account-picker">Your course team<select id="course-team">${account.teams.map(team=>`<option value="${e(team.id)}">${e(team.name)}</option>`).join("")}</select></label><p>Choose the team your organizer is using for this course.</p>`
        : '<p>Create or join your course team in <a href="/?returnTo=%2Fcourse%23course-account&setupTeam=1">your workspace</a>.</p>'}`;
      if (account.teams.length) {
        const picker = $("course-team");
        teamId = picker.value = selectedCourseTeam(account);
        picker.addEventListener("change", () => {
          teamId = picker.value;
          rememberCourseTeam(account, teamId);
          document.dispatchEvent(new Event("course-team-change"));
          loadTeam();
        });
        loadTeam();
      }
    }
    document.dispatchEvent(new CustomEvent("course-ready"));
  }catch(error){$("course-status").textContent=error.message;}
}
// Load the story module before emitting readiness events, without a circular import.
Promise.all([
  import("./course-stories.js"),
  import("./course-delivery.js"),
  import("./course-learner-portfolio.js"),
]).then(load);
