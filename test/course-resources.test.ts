import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { course } from "../src/course-content.js";
import { courseHandbook, assignmentMarkdown } from "../src/course-handbook.js";
import { buildCourseCalendar, zonedInstant } from "../src/course-schedule.js";

const root = path.resolve("public/course-kit");
describe("shipped course resources", () => {
  it("ships exactly the current generated handbook, assignment briefs, and templates", () => {
    expect(readFileSync(path.join(root, "Course Handbook.md"), "utf8")).toBe(courseHandbook());
    for (const assignment of course.assignments) expect(readFileSync(path.join(root, "assignments", assignment.id + ".md"), "utf8")).toBe(assignmentMarkdown(assignment.id));
    for (const template of course.toolkit) expect(readFileSync(path.join(root, "templates", template.id + ".md"), "utf8")).toBe(`# ${template.title}\n\n${template.text}\n`);
  });
  it("keeps starter assets inside the extracted kit and links back to the hosted course", () => {
    for (const name of ["api-starter", "storage-lab"]) {
      const folder = path.join(root, name);
      const html = readFileSync(path.join(folder, "index.html"), "utf8");
      expect(html).toContain('href="https://collavibe.vercel.app/course#api-lab"');
      for (const [, target] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        if (/^(https?:|#)/.test(target)) continue;
        expect(target.startsWith("/"), `Broken root-relative URL in downloaded ${name}: ${target}`).toBe(false);
        expect(existsSync(path.resolve(folder, target)), `Missing downloaded asset ${target}`).toBe(true);
      }
    }
  });
});
describe("additional course timezone boundaries", () => {
  it("keeps evening classes local at fall-back and uses literal elapsed hours for candidate/final deadlines", () => {
    const calendar = buildCourseCalendar({ dates: ["2027-10-19", "2027-10-26", "2027-11-02", "2027-11-09", "2027-11-16"], startTime: "18:00", timeZone: "America/New_York", location: "" });
    expect(calendar.sessions[2].start).toBe("2027-11-02T22:00:00.000Z");
    expect(calendar.sessions[3].start).toBe("2027-11-09T23:00:00.000Z");
    expect(Date.parse(calendar.sessions[4].start!) - Date.parse(calendar.candidateDue!)).toBe(24 * 3600000);
    expect(Date.parse(calendar.assignments.find(row => row.id === "final-project")!.due!) - Date.parse(calendar.sessions[4].end!)).toBe(72 * 3600000);
  });
  it("supports fractional-hour timezones and rejects impossible local calendar dates", () => {
    expect(zonedInstant("2027-02-16", "18:00", "Asia/Kathmandu").toISOString()).toBe("2027-02-16T12:15:00.000Z");
    expect(() => zonedInstant("2027-02-30", "18:00", "America/New_York")).toThrow();
  });
});
