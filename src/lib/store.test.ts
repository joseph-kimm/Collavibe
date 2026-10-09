import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { attachEvidence, claimFeature, createFeature, getProjectView, requestReview, resetStoreForTests, resolveReview, startSession, updateFeature } from "./store";

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "collavibe-test-"));
process.env.COLLAVIBE_DATA_PATH = path.join(tempRoot, "data.json");

beforeEach(async () => resetStoreForTests());
afterAll(async () => rm(tempRoot, { recursive: true, force: true }));

describe("Collavibe project workflow", () => {
  it("creates a queued feature from a user story and criteria", async () => {
    const feature = await createFeature({ title: "Confirm a meeting place", userStory: "As a student, I can agree on a public meeting place.", acceptanceCriteria: ["Both students see the same location"], risk: "medium" });
    expect(feature.status).toBe("queued");
    expect((await getProjectView()).features).toContainEqual(feature);
  });
  it("requires ownership before a work session can start", async () => {
    await expect(startSession({ featureId: "feature_reflection", memberId: "member_maya", plan: "Build the private reflection form.", expectedEvidence: "Privacy and edit-state tests." })).rejects.toThrow("Claim the feature");
    await claimFeature("feature_reflection", "member_maya");
    const session = await startSession({ featureId: "feature_reflection", memberId: "member_maya", plan: "Build the private reflection form.", expectedEvidence: "Privacy and edit-state tests." });
    expect(session.featureId).toBe("feature_reflection");
  });

  it("requires evidence before requesting review", async () => {
    await expect(requestReview({ featureId: "feature_search", requesterId: "member_maya", reviewerId: "member_noa" })).rejects.toThrow("Attach evidence");
    await attachEvidence({ featureId: "feature_search", memberId: "member_maya", type: "test", title: "Refresh test", result: "pass", details: "Filter state remains after a full page refresh." });
    const review = await requestReview({ featureId: "feature_search", requesterId: "member_maya", reviewerId: "member_noa" });
    expect(review.status).toBe("requested");
  });

  it("prevents a feature from being marked done without accepted review", async () => {
    await expect(updateFeature({ featureId: "feature_search", status: "done" })).rejects.toThrow("Done requires");
  });

  it("allows only the assigned teammate to resolve review", async () => {
    const view = await getProjectView();
    const review = view.reviews.find((item) => item.id === "review_request")!;
    await expect(resolveReview({ reviewId: review.id, reviewerId: "member_noa", status: "accepted", notes: "Looks good." })).rejects.toThrow("assigned reviewer");
    const resolved = await resolveReview({ reviewId: review.id, reviewerId: "member_maya", status: "accepted", notes: "Evidence checked independently." });
    expect(resolved.status).toBe("accepted");
  });

  it("returns feature summaries with evidence and active sessions", async () => {
    const view = await getProjectView();
    const search = view.featureSummaries.find((feature) => feature.id === "feature_search");
    expect(search?.owner?.name).toBe("Maya Chen");
    expect(search?.activeSession?.plan).toContain("filter controls");
  });
});
