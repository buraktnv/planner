import type { UIMessage } from "ai";

export interface ClaudeSdkChatOptions {
  messages: UIMessage[];
  focus?: { type: "project" | "area"; slug: string };
}

export async function claudeSdkChat(_opts: ClaudeSdkChatOptions): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: "Claude subscription chat not implemented yet (Task 16)",
    }),
    { status: 501, headers: { "content-type": "application/json" } },
  );
}
