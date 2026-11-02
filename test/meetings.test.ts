import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";
import { createMeeting, editMeeting, getMeeting, listMeetings } from "../src/meetings.js";
import { proposeTickets } from "../src/tickets.js";

let f: Awaited<ReturnType<typeof collaborationFixture>>;
beforeAll(async () => { f = await collaborationFixture(); });
afterAll(async () => { await f.cleanup(); });
describe("meeting evidence and review", () => {
  it("requires consent and saves team-only transcript evidence without raw audio", async () => {
    await expect(createMeeting(f.owner, f.teamId, f.projectId, { title: "Team planning", transcript: "A: Build validation." })).rejects.toThrow();
    const meeting = await createMeeting(f.owner, f.teamId, f.projectId, { title: "Team planning", transcript: "A: Build validation.", consentConfirmed: true, segments: [{ speaker: "A", start: 0, end: 2, text: "Build validation." }], speakers: { A: "Speaker 1" } });
    expect(meeting.payload.recordingStored).toBe(false); expect(meeting.payload.speakersReviewed).toBe(false);
    expect((await listMeetings(f.member, f.teamId, f.projectId)).map(row => row.id)).toContain(meeting.id);
    await expect(getMeeting(f.outsider, f.teamId, f.projectId, meeting.id)).rejects.toMatchObject({ status: 403 });
  });
  it("supports reviewed speaker labels and protects authorship and stale revisions", async () => {
    const meeting = (await listMeetings(f.owner, f.teamId, f.projectId))[0];
    await expect(editMeeting(f.member, f.teamId, f.projectId, meeting.id, { expectedVersion: meeting.version, speakers: { A: "Invented" } })).rejects.toMatchObject({ status: 403 });
    const changed = await editMeeting(f.owner, f.teamId, f.projectId, meeting.id, { expectedVersion: meeting.version, speakers: { A: "Joseph" }, speakersReviewed: true });
    expect(changed.payload.speakersReviewed).toBe(true); expect(changed.payload.speakers).toEqual({ A: "Joseph" });
    await expect(editMeeting(f.owner, f.teamId, f.projectId, meeting.id, { expectedVersion: meeting.version, summary: "Stale" })).rejects.toMatchObject({ status: 409 });
  });
  it("permits an agent-summary draft but not agent rewriting of evidence or speaker identities", async () => {
    const meeting = (await listMeetings(f.owner, f.teamId, f.projectId))[0];
    await expect(editMeeting(f.owner, f.teamId, f.projectId, meeting.id, { expectedVersion: meeting.version, speakers: { A: "Someone else" } }, true)).rejects.toMatchObject({ status: 403 });
    const summary = await editMeeting(f.owner, f.teamId, f.projectId, meeting.id, { expectedVersion: meeting.version, summary: "Draft: validate empty responses; confirm the API contract." }, true);
    expect(summary.payload.summarySource).toBe("agent_draft"); expect(summary.payload.transcript).toBe(meeting.payload.transcript);
    const tickets = await proposeTickets(f.owner, f.teamId, f.projectId, { requestId: "meeting_proposals_1", proposals: [{ title: "Validate empty responses", sourceKind: "meeting", sourceId: meeting.id }] });
    expect(tickets[0].payload.status).toBe("proposed"); expect(tickets[0].payload.sourceId).toBe(meeting.id);
  });
  it("invalidates timestamp alignment when the transcript is manually rewritten", async () => {
    const meeting = (await listMeetings(f.owner, f.teamId, f.projectId))[0];
    const changed = await editMeeting(f.owner, f.teamId, f.projectId, meeting.id, { expectedVersion: meeting.version, transcript: "Corrected transcript in the learner's words." });
    expect(changed.payload.segments).toEqual([]); expect(changed.payload.speakersReviewed).toBe(false);
  });
});
