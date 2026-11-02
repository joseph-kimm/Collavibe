import { z } from "zod";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { sessionLearning, writeReflection, writeSessionReply, removeLearningEntry } from "../src/session-learning.js";
import type { Actor } from "../src/collaboration-records.js";
import { listTickets, createTicket, changeTicket } from "../src/tickets.js";

type AuthRequest = Request & { collavibeUser?: Actor };
const route = (handler: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next: NextFunction) => { Promise.resolve(handler(req as AuthRequest, res)).catch(next); };
const params = (req: Request) => [String(req.params.teamId), String(req.params.projectId), String(req.params.sessionId)] as const;

export function registerCollaborationRoutes(app: Express, requireUser: RequestHandler) {
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
