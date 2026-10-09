import { z } from "zod";
import { attachEvidence, claimFeature, createFeature, finishSession, recordDecision, requestReview, resolveReview, startSession, updateFeature } from "./store";

export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_feature"), title: z.string().min(3), userStory: z.string().min(12), acceptanceCriteria: z.array(z.string().min(4)).min(1), risk: z.enum(["low", "medium", "high"]) }),
  z.object({ action: z.literal("claim_feature"), featureId: z.string(), memberId: z.string() }),
  z.object({ action: z.literal("start_session"), featureId: z.string(), memberId: z.string(), plan: z.string().min(8), expectedEvidence: z.string().min(8) }),
  z.object({ action: z.literal("record_decision"), featureId: z.string(), memberId: z.string(), decision: z.string().min(4), rationale: z.string().min(8), alternatives: z.string().min(3), affectedComponents: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("attach_evidence"), featureId: z.string(), memberId: z.string(), type: z.enum(["test", "preview", "screenshot", "log", "explanation"]), title: z.string().min(3), result: z.enum(["pass", "fail", "inconclusive"]), details: z.string().min(8), url: z.url().optional() }),
  z.object({ action: z.literal("request_review"), featureId: z.string(), requesterId: z.string(), reviewerId: z.string() }),
  z.object({ action: z.literal("resolve_review"), reviewId: z.string(), reviewerId: z.string(), status: z.enum(["accepted", "changes_requested"]), notes: z.string().min(4) }),
  z.object({ action: z.literal("update_feature"), featureId: z.string(), status: z.enum(["queued", "active", "review", "done", "blocked"]) }),
  z.object({ action: z.literal("finish_session"), sessionId: z.string(), summary: z.string().min(8), handoff: z.object({ intent: z.string().min(4), changes: z.string().min(4), evidenceSummary: z.string().min(4), uncertainty: z.string().min(3), nextAction: z.string().min(4) }) }),
]);

export type ActionInput = z.infer<typeof actionSchema>;

export async function runAction(input: ActionInput) {
  switch (input.action) {
    case "create_feature": return createFeature(input);
    case "claim_feature": return claimFeature(input.featureId, input.memberId);
    case "start_session": return startSession(input);
    case "record_decision": return recordDecision(input);
    case "attach_evidence": return attachEvidence(input);
    case "request_review": return requestReview(input);
    case "resolve_review": return resolveReview(input);
    case "update_feature": return updateFeature(input);
    case "finish_session": return finishSession(input);
  }
}
