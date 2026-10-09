import { NextResponse } from "next/server";
import { actionSchema, runAction } from "@/lib/actions";
import { getProjectView } from "@/lib/store";

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", details: parsed.error.flatten() }, { status: 400 });
  try {
    await runAction(parsed.data);
    return NextResponse.json(await getProjectView());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed" }, { status: 409 });
  }
}

