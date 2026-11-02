import { z } from "zod";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { sessionLearning, writeReflection, writeSessionReply, removeLearningEntry } from "../src/session-learning.js";
import type { Actor } from "../src/collaboration-records.js";
import { listTickets, createTicket, changeTicket } from "../src/tickets.js";
import express from "express";
import { collaborationScope } from "../src/collaboration-records.js";
import { createMeeting, editMeeting, listMeetings } from "../src/meetings.js";
import { audioAvailability, transcribeMeetingAudio } from "./meeting-audio.js";
import { requestLimit } from "./request-limits.js";
import { previewPortfolio, publishPortfolio, listPortfolios, revokePortfolio, publicPortfolio, portfolioFeedback, feedbackPermissions, removePortfolioFeedback } from "../src/portfolios.js";

type AuthRequest = Request & { collavibeUser?: Actor };
const route = (handler: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next: NextFunction) => { Promise.resolve(handler(req as AuthRequest, res)).catch(next); };
const params = (req: Request) => [String(req.params.teamId), String(req.params.projectId), String(req.params.sessionId)] as const;

export function registerCollaborationRoutes(app: Express, requireUser: RequestHandler) {
  const portfolioPath = "/api/teams/:teamId/projects/:projectId/portfolios";
  app.get(portfolioPath, requireUser, route(async (req, res) => { res.json({ portfolios: await listPortfolios(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId)) }); }));
  app.post(portfolioPath + "/preview", requireUser, route(async (req, res) => { res.json(await previewPortfolio(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId), req.body)); }));
  app.post(portfolioPath, requireUser, requestLimit("portfolio-publish", 10, 600), route(async (req, res) => { const row = await publishPortfolio(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId), req.body); res.status(201).json({ id: row.id, version: row.version, path: "/p/" + row.id }); }));
  app.post(portfolioPath + "/:portfolioId/revoke", requireUser, route(async (req, res) => { const input = z.object({ expectedVersion: z.number().int().positive() }).parse(req.body); const row = await revokePortfolio(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId), String(req.params.portfolioId), input.expectedVersion); res.json({ id: row.id, published: false, version: row.version }); }));
  const publicPath = "/api/public/portfolios/:portfolioId";
  app.get(publicPath, route(async (req, res) => { res.json(await publicPortfolio(String(req.params.portfolioId))); }));
  app.get(publicPath + "/permissions", requireUser, route(async (req, res) => { res.json(await feedbackPermissions(req.collavibeUser!, String(req.params.portfolioId))); }));
  app.post(publicPath + "/feedback", requireUser, requestLimit("portfolio-feedback", 12, 60), route(async (req, res) => { await portfolioFeedback(req.collavibeUser!, String(req.params.portfolioId), req.body); res.status(201).json({ saved: true }); }));
  app.delete(publicPath + "/feedback/:feedbackId", requireUser, route(async (req, res) => { await removePortfolioFeedback(req.collavibeUser!, String(req.params.portfolioId), String(req.params.feedbackId)); res.json({ removed: true }); }));
  const meetingsPath = "/api/teams/:teamId/projects/:projectId/meetings";
  app.get(meetingsPath, requireUser, route(async (req, res) => { res.json({ meetings: await listMeetings(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId)), audio: audioAvailability() }); }));
  app.post(meetingsPath, requireUser, route(async (req, res) => { res.status(201).json({ meeting: await createMeeting(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId), req.body) }); }));
  app.patch(meetingsPath + "/:meetingId", requireUser, route(async (req, res) => { res.json({ meeting: await editMeeting(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId), String(req.params.meetingId), req.body) }); }));
  app.post(meetingsPath + "/transcribe/audio", requireUser, requestLimit("meeting-audio", 8, 600), express.raw({ type: () => true, limit: "3mb" }), route(async (req, res) => {
    await collaborationScope(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId));
    const bytes = Buffer.isBuffer(req.body) ? req.body : new Uint8Array();
    res.json(await transcribeMeetingAudio(bytes, String(req.headers["content-type"] || ""), req.headers["x-recording-consent"] === "confirmed"));
  }));
  const ticketsPath = "/api/teams/:teamId/projects/:projectId/tickets";
  app.get(ticketsPath, requireUser, route(async (req, res) => { res.json({ tickets: await listTickets(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId)) }); }));
  app.post(ticketsPath, requireUser, route(async (req, res) => { res.status(201).json({ ticket: await createTicket(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId), req.body) }); }));
  app.patch(ticketsPath + "/:ticketId", requireUser, route(async (req, res) => { res.json({ ticket: await changeTicket(req.collavibeUser!, String(req.params.teamId), String(req.params.projectId), String(req.params.ticketId), req.body) }); }));
  const sessionPath = "/api/teams/:teamId/projects/:projectId/sessions/:sessionId/learning";
  app.get(sessionPath, requireUser, route(async (req, res) => {
    const { records } = await sessionLearning(req.collavibeUser!, ...params(req));
    res.json({ records });
  }));
  app.put(sessionPath + "/reflection", requireUser, route(async (req, res) => {
    res.json({ record: await writeReflection(req.collavibeUser!, ...params(req), req.body) });
  }));
  app.post(sessionPath + "/replies", requireUser, route(async (req, res) => {
    res.status(201).json({ record: await writeSessionReply(req.collavibeUser!, ...params(req), req.body) });
  }));
  app.delete(sessionPath + "/:recordId", requireUser, route(async (req, res) => {
    const { expectedVersion } = z.object({ expectedVersion: z.number().int().positive() }).parse(req.body);
    res.json({ record: await removeLearningEntry(req.collavibeUser!, ...params(req), String(req.params.recordId), expectedVersion) });
  }));
}
