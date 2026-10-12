"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const REFRESH_DELAY_MS = 300;

/**
 * Keeps the chat list current: refreshes when shown (going back can restore a
 * cached copy) and whenever a message arrives or a chat is read. RLS limits
 * the change events to the viewer's own conversations. Renders nothing.
 */
export function ChatListLive() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();

    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
    };

    const channel = supabase
      .channel("changes:my-chats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refreshSoon)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members" }, refreshSoon);

    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
