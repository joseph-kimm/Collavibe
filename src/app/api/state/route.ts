import { NextResponse } from "next/server";
import { getProjectView } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProjectView(), { headers: { "Cache-Control": "no-store" } });
}

