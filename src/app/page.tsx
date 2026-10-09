import { getProjectView } from "@/lib/store";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <Workspace initialState={await getProjectView()} />;
}

