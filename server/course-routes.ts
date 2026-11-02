import { z } from "zod";
import type { Express, Request, RequestHandler, Response, NextFunction } from "express";
import type { Actor } from "../src/collaboration-records.js";
import { course } from "../src/course-content.js";
import { courseAccount, ownIntake, saveIntake, organizerIntakes, removeIntake } from "../src/course.js";
import { listCourseStories,saveCourseStory,previewCourseStory,publishCourseStory,unpublishCourseStory,publicCourseStories } from "../src/course-stories.js";
import { requestLimit } from "./request-limits.js";

type AuthRequest = Request & { collavibeUser?: Actor };
const route = (handler:(req:AuthRequest,res:Response)=>Promise<unknown>):RequestHandler => (req,res,next:NextFunction)=>{Promise.resolve(handler(req as AuthRequest,res)).catch(next);};
export function registerCourseRoutes(app:Express,requireUser:RequestHandler) {
  app.get("/api/course",(_req,res)=>res.json(course));
  app.get("/api/course/account",requireUser,route(async(req,res)=>res.json(await courseAccount(req.collavibeUser!))));
  const base="/api/course/teams/:teamId";
  app.get("/api/course/stories",route(async(_req,res)=>res.json({stories:await publicCourseStories()})));
  app.get(base+"/stories",requireUser,route(async(req,res)=>res.json({stories:await listCourseStories(req.collavibeUser!,String(req.params.teamId))})));
  app.post(base+"/stories",requireUser,requestLimit("course-story",20,600),route(async(req,res)=>res.status(201).json({story:await saveCourseStory(req.collavibeUser!,String(req.params.teamId),req.body)})));
  app.patch(base+"/stories/:storyId",requireUser,route(async(req,res)=>res.json({story:await saveCourseStory(req.collavibeUser!,String(req.params.teamId),req.body,String(req.params.storyId))})));
  app.post(base+"/stories/:storyId/preview",requireUser,route(async(req,res)=>res.json(await previewCourseStory(req.collavibeUser!,String(req.params.teamId),String(req.params.storyId)))));
  app.post(base+"/stories/:storyId/publish",requireUser,route(async(req,res)=>res.json({story:await publishCourseStory(req.collavibeUser!,String(req.params.teamId),String(req.params.storyId),req.body)})));
  app.post(base+"/stories/:storyId/unpublish",requireUser,route(async(req,res)=>{const input=z.object({expectedVersion:z.number().int().positive()}).parse(req.body);res.json({story:await unpublishCourseStory(req.collavibeUser!,String(req.params.teamId),String(req.params.storyId),input.expectedVersion)});}));
  app.get(base+"/intake",requireUser,route(async(req,res)=>res.json({intake:await ownIntake(req.collavibeUser!,String(req.params.teamId))})));
  app.put(base+"/intake",requireUser,route(async(req,res)=>res.json({intake:await saveIntake(req.collavibeUser!,String(req.params.teamId),req.body)})));
  app.delete(base+"/intake",requireUser,route(async(req,res)=>{const input=z.object({expectedVersion:z.number().int().positive()}).parse(req.body);await removeIntake(req.collavibeUser!,String(req.params.teamId),input.expectedVersion);res.json({removed:true});}));
  app.get(base+"/intakes",requireUser,route(async(req,res)=>res.json({intakes:await organizerIntakes(req.collavibeUser!,String(req.params.teamId))})));
}
