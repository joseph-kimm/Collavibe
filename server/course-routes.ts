import { z } from "zod";
import type { Express, Request, RequestHandler, Response, NextFunction } from "express";
import type { Actor } from "../src/collaboration-records.js";
import { course } from "../src/course-content.js";
import { courseAccount, ownIntake, saveIntake, organizerIntakes, removeIntake } from "../src/course.js";

type AuthRequest = Request & { collavibeUser?: Actor };
const route = (handler:(req:AuthRequest,res:Response)=>Promise<unknown>):RequestHandler => (req,res,next:NextFunction)=>{Promise.resolve(handler(req as AuthRequest,res)).catch(next);};
export function registerCourseRoutes(app:Express,requireUser:RequestHandler) {
  app.get("/api/course",(_req,res)=>res.json(course));
  app.get("/api/course/account",requireUser,route(async(req,res)=>res.json(await courseAccount(req.collavibeUser!))));
  const base="/api/course/teams/:teamId";
  app.get(base+"/intake",requireUser,route(async(req,res)=>res.json({intake:await ownIntake(req.collavibeUser!,String(req.params.teamId))})));
  app.put(base+"/intake",requireUser,route(async(req,res)=>res.json({intake:await saveIntake(req.collavibeUser!,String(req.params.teamId),req.body)})));
  app.delete(base+"/intake",requireUser,route(async(req,res)=>{const input=z.object({expectedVersion:z.number().int().positive()}).parse(req.body);await removeIntake(req.collavibeUser!,String(req.params.teamId),input.expectedVersion);res.json({removed:true});}));
  app.get(base+"/intakes",requireUser,route(async(req,res)=>res.json({intakes:await organizerIntakes(req.collavibeUser!,String(req.params.teamId))})));
}
