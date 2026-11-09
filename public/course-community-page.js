import { mountSignIn, watchSession } from "./inline-auth.js";
import { api, rememberCourseTeam, selectedCourseTeam } from "./course-api.js";
import { mountCourseDiscussions } from "./course-community.js";
import { escape as e } from "./portfolio-content.js";

const host = document.getElementById("course-discussions");
const accountHost = document.getElementById("forum-account");

async function load() {
  try {
    const status = await api("/api/auth/status");
    watchSession(status.authenticated);
    if (!status.authenticated) {
      mountSignIn(host, { message: "Sign in to read and post in your cohort forum." });
      return;
    }
    const account = await api("/api/course/account");
    if (!account.teams.length) {
      host.innerHTML = '<p>Join your cohort team to read and post in the forum.</p><a class="button primary" href="/?returnTo=%2Fcourse%2Fcommunity&setupTeam=1">Join your cohort</a>';
      return;
    }
    accountHost.innerHTML = `<label class="course-account-picker">Cohort<select>
      ${account.teams.map(team => `<option value="${e(team.id)}">${e(team.name)}</option>`).join("")}
      </select></label><p class="cohort-label">Posts are visible to members of the selected cohort.</p>`;
    const picker = accountHost.querySelector("select");
    picker.value = selectedCourseTeam(account);
    picker.addEventListener("change", () => {
      rememberCourseTeam(account, picker.value);
      mountCourseDiscussions(host, { api, teamId: picker.value });
    });
    await mountCourseDiscussions(host, { api, teamId: picker.value });
  } catch (error) {
    host.innerHTML = `<p role="alert">${e(error.message)}</p><button type="button" class="button">Try again</button>`;
    host.querySelector("button").addEventListener("click", load);
  }
}

load();
