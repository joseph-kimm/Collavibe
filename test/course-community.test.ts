import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addCourseDiscussion, addDiscussionReply, courseDiscussions, removeDiscussionEntry,
  ownLearnerPortfolio, saveLearnerPortfolio, previewLearnerPortfolio, publishLearnerPortfolio,
  publicLearnerPortfolio, unpublishLearnerPortfolio,
} from "../src/course-community.js";
import { listCourseStories, previewCourseStory, publicCourseStories } from "../src/course-stories.js";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";

let fixture: Awaited<ReturnType<typeof collaborationFixture>>;
beforeAll(async () => { fixture = await collaborationFixture(); });
afterAll(async () => { await fixture.cleanup(); });

const post = { title: "Comparing two free hosts", body: "I tried the same app on two hosting plans and checked the cold start.", category: "comparison", groupName: "Field Notes team" };
const content = {
  title: "Four project notes", introduction: "Contact: learner@example.com",
  projects: [{
    assignmentId: "two-api", title: "Weather and air dashboard", problem: "Help a rider choose a route.",
    tools: "Open-Meteo and TypeScript", decision: "I kept a useful result when the second request failed.",
    evidence: "I simulated a failed second provider.", demoUrl: "https://example.com/demo",
  }],
};

describe("cohort community", () => {
  it("limits posts and replies to the cohort and separates stories from discussions", async () => {
    const { owner, member, outsider, teamId } = fixture;
    await expect(addCourseDiscussion(outsider, teamId, post)).rejects.toMatchObject({ status: 403 });
    const id = await addCourseDiscussion(member, teamId, { ...post, published: true });
    await addDiscussionReply(owner, teamId, id, { body: "What happened on a second request?" });
    await expect(courseDiscussions(outsider, teamId)).rejects.toMatchObject({ status: 403 });
    await expect(addDiscussionReply(outsider, teamId, id, { body: "I should not be able to reply." })).rejects.toMatchObject({ status: 403 });
    const [thread] = await courseDiscussions(member, teamId);
    expect(thread).toMatchObject({ id, title: post.title, groupName: "Field Notes team", canRemove: true, replies: [{ canRemove: false }] });
    expect(await listCourseStories(owner, teamId)).toEqual([]);
    expect(await publicCourseStories()).toEqual([]);
    await expect(previewCourseStory(member, teamId, id)).rejects.toMatchObject({ status: 404 });
    await expect(removeDiscussionEntry(member, teamId, id, { expectedVersion: 1 }, thread.replies[0].id)).rejects.toMatchObject({ status: 403 });
    await removeDiscussionEntry(owner, teamId, id, { expectedVersion: 1 }, thread.replies[0].id);
    expect((await courseDiscussions(member, teamId))[0].replies).toEqual([]);
    await removeDiscussionEntry(owner, teamId, id, { expectedVersion: 1 });
    expect(await courseDiscussions(member, teamId)).toEqual([]);
    await expect(addDiscussionReply(member, teamId, id, { body: "A late reply." })).rejects.toMatchObject({ status: 404 });
  });

  it("publishes only the reviewed portfolio snapshot and revokes it independently of the draft", async () => {
    const { owner, member, outsider, teamId } = fixture;
    const competing = await Promise.allSettled([
      saveLearnerPortfolio(member, teamId, content),
      saveLearnerPortfolio(member, teamId, content),
    ]);
    expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await ownLearnerPortfolio(owner, teamId)).toBeNull();
    await expect(ownLearnerPortfolio(outsider, teamId)).rejects.toMatchObject({ status: 403 });
    expect(await listCourseStories(owner, teamId)).toEqual([]);
    const original = await previewLearnerPortfolio(member, teamId);
    expect(original.snapshot.introduction).toBe("Contact: [private email]");
    await saveLearnerPortfolio(member, teamId, { ...content, title: "Revised title", expectedVersion: original.version });
    await expect(publishLearnerPortfolio(member, teamId, { expectedVersion: original.version, previewHash: original.previewHash, consent: true }))
      .rejects.toMatchObject({ status: 409 });
    const review = await previewLearnerPortfolio(member, teamId);
    const published = await publishLearnerPortfolio(member, teamId, { expectedVersion: review.version, previewHash: review.previewHash, consent: true });
    const publicId = published!.publicId!;
    expect(await publicLearnerPortfolio(publicId)).toEqual(review.snapshot);
    const updated = await saveLearnerPortfolio(member, teamId, { ...content, title: "Private follow-up", expectedVersion: published!.version });
    expect(await publicLearnerPortfolio(publicId)).toEqual(review.snapshot);
    await unpublishLearnerPortfolio(member, teamId, { expectedVersion: updated!.version });
    await expect(publicLearnerPortfolio(publicId)).rejects.toMatchObject({ status: 404 });
    expect((await ownLearnerPortfolio(member, teamId))?.content.title).toBe("Private follow-up");
    expect(await publicCourseStories()).toEqual([]);
  });
});
