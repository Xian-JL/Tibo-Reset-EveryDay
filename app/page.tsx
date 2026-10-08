import { getRawDb } from "@/db";
import { getSnapshot, unavailableSnapshot } from "@/lib/sync.mts";
import MessageList from "./message-list";

export const dynamic = "force-dynamic";

export default async function Home() {
  let snapshot;
  try { snapshot = await getSnapshot(getRawDb()); }
  catch { snapshot = unavailableSnapshot(); }
  return <MessageList initialSnapshot={snapshot} />;
}
