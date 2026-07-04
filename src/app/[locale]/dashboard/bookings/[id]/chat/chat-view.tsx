"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessageView } from "@/lib/data/chat";

export function ChatView({
  threadId,
  currentUserId,
  sendable,
  initialMessages,
}: {
  threadId: string;
  currentUserId: string;
  sendable: boolean;
  initialMessages: ChatMessageView[];
}) {
  const t = useTranslations("chat");
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  // Mark this thread read (own row, RLS-guarded upsert).
  async function markRead() {
    await supabase.from("chat_reads").upsert(
      { thread_id: threadId, user_id: currentUserId, last_read_at: new Date().toISOString() },
      { onConflict: "thread_id,user_id" }
    );
  }

  // Subscribe to new messages on this thread; mark read on mount.
  useEffect(() => {
    void markRead();
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const r = payload.new as { id: string; sender_id: string; body: string; created_at: string };
          setMessages((prev) =>
            prev.some((m) => m.id === r.id)
              ? prev
              : [...prev, { id: r.id, senderId: r.sender_id, body: r.body, createdAt: r.created_at }]
          );
          if (r.sender_id !== currentUserId) void markRead();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // supabase client is a stable singleton; threadId/currentUserId are stable per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, currentUserId]);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setPending(true);
    setError(false);
    const { data, error: insertError } = await supabase
      .from("chat_messages")
      .insert({ thread_id: threadId, sender_id: currentUserId, body })
      .select("id, sender_id, body, created_at")
      .single();
    sendingRef.current = false;
    setPending(false);
    if (insertError || !data) {
      setError(true);
      return;
    }
    // Append immediately rather than waiting for the realtime echo (the channel
    // may not be SUBSCRIBED yet, e.g. sending right after page load). The
    // subscription handler dedupes by id, so a later echo won't duplicate.
    setMessages((prev) =>
      prev.some((m) => m.id === data.id)
        ? prev
        : [
            ...prev,
            {
              id: data.id,
              senderId: data.sender_id,
              body: data.body,
              createdAt: data.created_at,
            },
          ]
    );
    setInput("");
  }

  return (
    <div className="border-border bg-surface-raised flex h-[70vh] flex-col rounded-2xl border">
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="text-text-muted text-sm">{t("empty")}</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[75%] rounded-2xl px-4 py-2 text-sm " +
                    (mine
                      ? "bg-action-primary text-text-inverse"
                      : "bg-surface-muted text-text-primary")
                  }
                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {sendable ? (
        <form onSubmit={handleSend} className="border-border flex items-center gap-2 border-t p-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            className="border-border text-text-primary placeholder:text-text-muted flex-1 rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none"
            aria-label={t("placeholder")}
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-action-primary text-text-inverse hover:bg-action-primary-hover rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {t("send")}
          </button>
        </form>
      ) : (
        <p className="border-border text-text-muted border-t p-4 text-xs">{t("read_only")}</p>
      )}

      {error && (
        <p role="alert" className="text-text-primary px-4 pb-3 text-xs">
          {t("send_error")}
        </p>
      )}
    </div>
  );
}
