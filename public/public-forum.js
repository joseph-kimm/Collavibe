import { api, selectedCourseTeam, rememberCourseTeam } from "./course-api.js";
import { mountSignIn, watchSession } from "./inline-auth.js";
import { mountCourseDiscussions } from "./course-community.js";
import { escape as e } from "./portfolio-content.js";
const accountHost = document.getElementById("forum-account");
const host = document.getElementById("course-discussions");
async function load() {
  // Reading discussions never depends on a successful account lookup.
  await mountCourseDiscussions(host, { api, publicForum: true, canPost: false });
  try {
    const status = await api("/api/auth/status");
    watchSession(status.authenticated);
    if (!status.authenticated) {
      accountHost.innerHTML = '<details><summary>Sign in to post or reply</summary><div></div></details>';
      mountSignIn(accountHost.querySelector("details div"), { message: "Reading is open to everyone. Sign in to join the conversation." });
      return;
    }
    const account = await api("/api/course/account");
    if (!account.teams.length) {
      accountHost.innerHTML = '<p>Join or create a team to post with your project community.</p><a class="button" href="/?setupTeam=1&returnTo=%2Fforum">Set up your team</a>';
      return;
    }
    accountHost.innerHTML = `<label>Posting with<select>${account.teams.map(t=>`<option value="${e(t.id)}">${e(t.name)}</option>`).join("")}</select></label><p>Public posts and replies are visible to everyone. <a href="/course/community">Open private cohort discussions</a>.</p>`;
    const picker=accountHost.querySelector("select");
    picker.value=selectedCourseTeam(account);
    function mount() {
      rememberCourseTeam(account,picker.value);
      const teamId=picker.value;
      const scopedApi=(path,options={})=>{
        if (!options.method && path === "/api/forum") return api("/api/forum/manage");
        if (options.method === "POST") {
          const body=JSON.parse(options.body);
          return api(path,{...options,body:JSON.stringify({...body,teamId,publicConsent:body.publicConsent==="on"})});
        }
        return api(path,options);
      };
      return mountCourseDiscussions(host,{api:scopedApi,publicForum:true,canPost:true});
    }
    picker.addEventListener("change",mount);
    await mount();
  } catch(error) { accountHost.textContent=error.message; }
}
load();
