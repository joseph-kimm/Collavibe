import { z } from "zod";

export const displayNameSchema = z.string().trim()
  .min(2, "Name must be between 2 and 120 characters.")
  .max(120, "Name must be between 2 and 120 characters.")
  .refine((name) => !/[\u0000-\u001f\u007f]/.test(name), "Name cannot contain line breaks or control characters.");

// Account identity comes exclusively from the authenticated session.
export const profilePatchSchema = z.object({ name: displayNameSchema }).strict();
