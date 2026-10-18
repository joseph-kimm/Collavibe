import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getSupabaseAdmin, isSupabaseConfigured, throwSupabaseError } from "../src/supabase.js";

const local = new Map<string, { attempts: number; expires: number }>();
export function consumeLocalLimit(key: string, budget: number, seconds: number, now = Date.now()) {
  for (const [name, row] of local) if (row.expires <= now) local.delete(name);
  const row = local.get(key) || { attempts: 0, expires: now + seconds * 1000 };
  row.attempts++; local.set(key, row);
  return row.attempts <= budget;
}
export function requestLimit(group: string, budget: number, seconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Vercel overwrites this header. Other hosts use the actual socket address.
      const address = process.env.VERCEL ? String(req.headers["x-vercel-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0] : req.socket.remoteAddress || "unknown";
      const key = createHash("sha256").update(group + ":" + address).digest("hex");
      let allowed: boolean;
      if (isSupabaseConfigured()) {
        const result = await getSupabaseAdmin().rpc("consume_request_limit", { bucket: key, budget, seconds });
        throwSupabaseError(result.error); allowed = result.data === true;
      } else allowed = consumeLocalLimit(key, budget, seconds);
      if (!allowed) {
        res.setHeader("Retry-After", String(seconds));
        return void res.status(429).json({ error: "Too many attempts. Please wait a few minutes before trying again." });
      }
      next();
    } catch { res.status(503).json({ error: "The service is temporarily unavailable. Please try again shortly." }); }
  };
}
