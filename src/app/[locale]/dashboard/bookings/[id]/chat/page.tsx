import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser } from "@/lib/auth";
import { getMyBookings, getTalacheroBookings } from "@/lib/data/bookings";
import { getOrCreateThread, getThreadMessages } from "@/lib/data/chat";
import { ChatView } from "./chat-view";

export default async function BookingChatPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  // Authorize + resolve counterparty/status from the caller's OWN booking
  // projection (these RPCs only return the caller's bookings and already expose
  // the other party's name behind users RLS).
  let counterpartyName: string | null = null;
  let status: string | null = null;
  if (user.role === "talachero") {
    const b = (await getTalacheroBookings()).find((x) => x.id === id);
    if (b) {
      counterpartyName = b.clientName;
      status = b.status;
    }
  } else {
    const b = (await getMyBookings()).find((x) => x.id === id);
    if (b) {
      counterpartyName = b.talacheroName;
      status = b.status;
    }
  }
  if (status === null) {
    notFound();
  }

  const threadId = await getOrCreateThread(id);
  const messages = await getThreadMessages(threadId);
  const t = await getTranslations("chat");
  const sendable = status !== "cancelled";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="text-text-secondary hover:text-text-primary mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">
          {t("with", { name: counterpartyName ?? "" })}
        </p>
      </div>

      <ChatView
        threadId={threadId}
        currentUserId={user.id}
        sendable={sendable}
        initialMessages={messages}
      />
    </div>
  );
}
