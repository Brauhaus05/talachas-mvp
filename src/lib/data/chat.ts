import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ChatMessageView {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/** Ensure a thread exists for this booking and return its id (authorizes the
 * caller as a booking participant inside the RPC). */
export async function getOrCreateThread(bookingId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_create_thread", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return data as string;
}

/** Messages in a thread, oldest first (RLS restricts to participants). */
export async function getThreadMessages(
  threadId: string
): Promise<ChatMessageView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
  }));
}

/** Total unread messages for the signed-in user (nav badge). Non-critical:
 * degrades to 0 on error rather than breaking the layout it renders in. */
export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_unread_count");
    if (error) throw error;
    return (data as number | null) ?? 0;
  } catch {
    return 0;
  }
}

/** Per-booking unread counts for the signed-in user (booking cards).
 * Non-critical: degrades to an empty map on error. */
export async function getUnreadMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_unread_map");
    if (error) throw error;
    for (const row of data ?? []) map.set(row.booking_id, row.unread);
  } catch {
    // Unread counts are non-critical; degrade to none rather than break the page.
  }
  return map;
}
