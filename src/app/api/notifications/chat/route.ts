import { z } from "zod";
import { runChatCheck } from "@/lib/notifications/chat";
import { isFromQStash } from "@/lib/notifications/qstash";

/** QStash calls this 5 minutes after a chat message (see lib/notifications/chat). */

const jobSchema = z.object({ userId: z.uuid(), conversationId: z.uuid(), jobId: z.uuid() });

export async function POST(request: Request) {
  const body = await request.text();
  if (!(await isFromQStash(request.headers.get("upstash-signature"), body))) {
    return new Response("invalid signature", { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const job = jobSchema.safeParse(json);
  if (!job.success) return new Response("bad request", { status: 400 });

  // A thrown error returns 500 and QStash retries.
  await runChatCheck(job.data);
  return new Response(null, { status: 204 });
}
