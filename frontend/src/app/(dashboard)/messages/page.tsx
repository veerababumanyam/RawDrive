"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { listChannels, getMessages, sendMessage, createChannelAuth, type Channel, type Message } from "@/lib/api/messaging";
import {
  listInquiries,
  getInquiryMessages,
  sendInquiryMessage,
  type MarketplaceInquiry,
  type InquiryMessage,
} from "@/lib/api/marketplace";
import { getStoredAccessToken, getStoredAccessTokenClaims } from "@/lib/auth";

type Tab = "channels" | "inquiries";

// safeAttachmentUrl returns the attachment URL only when it is an https: URL,
// otherwise null. Attachment URLs flow from the messaging API and are NOT
// trusted: messaging_handler.go decodes attachment_url straight from the
// request body and persists it verbatim, so any workspace member can POST a
// `javascript:`/`data:` URL that would otherwise execute in the recipient's
// dashboard origin when the Attachment <a href> is clicked (stored XSS).
// We use a positive allowlist (https only) — backend storage links are https.
export function safeAttachmentUrl(url: string | undefined | null): string | null {
  if (typeof url !== "string") return null;
  return url.startsWith("https:") ? url : null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ─── InquiryConversation ─────────────────────────────────────────────────────
// Multi-turn thread: original inquiry message seeded at the top, then all
// messages from inquiry_messages table. Both parties can reply.

function InquiryConversation({
  inquiry,
  currentUserID,
  onBack,
}: {
  inquiry: MarketplaceInquiry;
  currentUserID: string;
  onBack: () => void;
}) {
  const token = getStoredAccessToken();
  const isSender = inquiry.from_user_id === currentUserID;
  const otherName = isSender
    ? (inquiry.to_user_name ?? inquiry.to_user_email ?? "Photographer")
    : (inquiry.from_user_name ?? inquiry.from_user_email ?? "Client");

  const [messages, setMessages] = useState<InquiryMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getInquiryMessages(token, inquiry.id);
      setMessages(data);
    } catch {
      // non-fatal — show empty thread
    } finally {
      setLoadingMessages(false);
    }
  }, [token, inquiry.id]);

  useEffect(() => {
    setLoadingMessages(true);
    setMessages([]);
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!msgText.trim() || !token || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const msg = await sendInquiryMessage(token, inquiry.id, msgText.trim());
      setMessages((prev) => [...prev, msg]);
      setMsgText("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const initials = (name: string | undefined | null, fallback: string) =>
    (name ?? fallback).slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default flex items-center gap-3 shrink-0">
        {/* Back button — visible on mobile only */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to inquiries"
          className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-sunken/40 transition-colors"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">{otherName}</p>
          <p className="text-xs text-text-secondary capitalize">{inquiry.status} · {formatTime(inquiry.created_at)}</p>
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Seed: original inquiry message — always shown first */}
        <ChatBubble
          body={inquiry.message}
          time={inquiry.created_at}
          isMine={isSender}
          initials={initials(isSender ? "Me" : inquiry.from_user_name, "Me")}
          extra={inquiry.event_date
            ? `Event: ${new Date(inquiry.event_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
            : undefined}
        />

        {/* Thread messages */}
        {loadingMessages ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          messages.map((msg) => {
            const mine = msg.sender_id === currentUserID;
            return (
              <ChatBubble
                key={msg.id}
                body={msg.body}
                time={msg.created_at}
                isMine={mine}
                initials={initials(mine ? "Me" : msg.sender_name, "?")}
              />
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer — both parties can reply */}
      <div className="px-4 py-3 border-t border-border-default space-y-2 shrink-0">
        {sendError && (
          <p className="text-xs text-feedback-error">{sendError}</p>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Type a message…"
            rows={1}
            className="input-base min-h-[44px] flex-1 resize-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !msgText.trim()}
            className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  body,
  time,
  isMine,
  initials,
  extra,
}: {
  body: string;
  time: string;
  isMine: boolean;
  initials: string;
  extra?: string;
}) {
  return (
    <div className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
        isMine ? "bg-accent/20 text-accent" : "bg-surface-container-low text-text-secondary"
      }`}>
        {initials}
      </div>
      <div className={`max-w-[75%] sm:max-w-sm flex flex-col ${isMine ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm ${
          isMine
            ? "bg-accent text-text-inverse rounded-tr-sm"
            : "bg-surface-container-low text-text-primary rounded-tl-sm"
        }`}>
          <p className="whitespace-pre-wrap break-words">{body}</p>
        </div>
        <p className="text-xs text-text-tertiary mt-1">{formatShortTime(time)}</p>
        {extra && <p className="text-xs text-text-secondary mt-0.5">{extra}</p>}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const token = getStoredAccessToken();
  const currentUserID = typeof window !== "undefined" ? (getStoredAccessTokenClaims()?.sub ?? "") : "";
  const [tab, setTab] = useState<Tab>("channels");

  // Channels state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inquiries state
  const [inquiries, setInquiries] = useState<MarketplaceInquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<MarketplaceInquiry | null>(null);

  useEffect(() => {
    listChannels(token)
      .then((chs) => {
        setChannels(chs);
        if (chs.length > 0) setActiveChannel(chs[0].id);
      })
      .catch((err) => { setError(err?.message || "Failed to load channels"); setChannels([]); })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!activeChannel) return;
    getMessages(token, activeChannel)
      .then(setMessages)
      .catch((err) => { setError(err?.message || "Failed to load messages"); setMessages([]); });
  }, [activeChannel, token]);

  useEffect(() => {
    if (!token) return;
    const es = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/events/stream?token=${token}&channels=chat`
    );
    es.addEventListener("chat.message", (e) => {
      const msg: Message = JSON.parse(e.data);
      if (msg.channel_id === activeChannel) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    es.onerror = () => { /* EventSource auto-reconnects */ };
    return () => es.close();
  }, [token, activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (tab !== "inquiries" || !token) return;
    setInquiriesLoading(true);
    listInquiries(token)
      .then(setInquiries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load inquiries"))
      .finally(() => setInquiriesLoading(false));
  }, [tab, token]);

  const handleSend = async () => {
    if (!msgText.trim() || !activeChannel || sending) return;
    setSending(true);
    const msg = await sendMessage(token, activeChannel, { body: msgText });
    if (msg) setMessages((prev) => [...prev, msg]);
    setMsgText("");
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-72 border-r border-border-default p-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-surface-sunken rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="h-full bg-surface-sunken rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {error && (
        <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error shrink-0">
          {error}
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex border-b border-border-default px-4 gap-1 pt-2 shrink-0">
        {(["channels", "inquiries"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              // Reset mobile conversation view when switching tabs
              if (t === "channels") setSelectedInquiry(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t === "channels" ? "Channels" : "Inquiries"}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        {tab === "channels" ? (
          <>
            {/* Channel sidebar — hidden on mobile when a channel is active (future) */}
            <aside className="w-full md:w-72 md:shrink-0 border-r border-border-default bg-white/[0.02] flex flex-col
              hidden md:flex">
              <div className="p-4 border-b border-border-default flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">Channels</h2>
                <button
                  type="button"
                  onClick={() => setShowNewChannel((v) => !v)}
                  aria-label="New channel"
                  className="surface-button h-8 w-8 p-0"
                >
                  +
                </button>
              </div>
              {showNewChannel && (
                <form
                  className="p-3 border-b border-border-default flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = newChannelName.trim();
                    if (!name) return;
                    setCreatingChannel(true);
                    setError(null);
                    try {
                      const ch = await createChannelAuth({ name, channel_type: "group" });
                      setChannels((prev) => [ch, ...prev]);
                      setActiveChannel(ch.id);
                      setNewChannelName("");
                      setShowNewChannel(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to create channel");
                    } finally {
                      setCreatingChannel(false);
                    }
                  }}
                >
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="channel name"
                    className="input-base flex-1 h-9 text-xs"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={creatingChannel || !newChannelName.trim()}
                    className="btn-primary px-3 text-xs disabled:opacity-50"
                  >
                    {creatingChannel ? "…" : "Create"}
                  </button>
                </form>
              )}
              <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {channels.length === 0 ? (
                  <div className="text-center py-8 text-text-secondary text-sm">No channels yet</div>
                ) : (
                  channels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setActiveChannel(ch.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px] ${
                        activeChannel === ch.id
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                      }`}
                    >
                      <span className="mr-2 text-xs opacity-60">
                        {ch.channel_type === "dm" ? "•" : "#"}
                      </span>
                      {ch.name}
                    </button>
                  ))
                )}
              </nav>
            </aside>

            {/* Message thread */}
            <div className="flex-1 flex flex-col min-w-0">
              {activeChannel ? (
                <>
                  <div className="px-5 py-3 border-b border-border-default flex items-center justify-between shrink-0">
                    <h3 className="text-sm font-semibold text-text-primary">
                      # {channels.find((c) => c.id === activeChannel)?.name || "Channel"}
                    </h3>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center py-12 text-text-secondary text-sm">
                        No messages yet. Start the conversation!
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div key={msg.id} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                            <span className="text-xs text-accent font-medium">
                              {msg.sender_id.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium text-text-primary">
                                {msg.sender_id.slice(0, 8)}
                              </span>
                              <span className="text-xs text-text-secondary">
                                {new Date(msg.inserted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {msg.edited_at && (
                                <span className="text-xs text-text-secondary">(edited)</span>
                              )}
                            </div>
                            <p className="text-sm text-text-secondary mt-0.5">{msg.body}</p>
                            {(() => {
                              const href = safeAttachmentUrl(msg.attachment_url);
                              return href ? (
                                <a href={href} className="text-xs text-accent underline mt-1 block" target="_blank" rel="noopener noreferrer">
                                  Attachment
                                </a>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="px-5 py-3 border-t border-border-default shrink-0">
                    <div className="flex gap-2 items-end">
                      <textarea
                        value={msgText}
                        onChange={(e) => setMsgText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        rows={1}
                        className="input-base min-h-[44px] flex-1 resize-none"
                      />
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending || !msgText.trim()}
                        className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
                  Select a channel to start messaging
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Inquiries tab ───────────────────────────────────────────────── */
          <>
            {/* Inquiry list sidebar
                Mobile: full width, hidden when an inquiry is open
                Desktop: fixed width, always visible */}
            <aside className={`
              border-r border-border-default flex flex-col
              w-full md:w-72 md:shrink-0
              ${selectedInquiry ? "hidden md:flex" : "flex"}
            `}>
              <div className="p-4 border-b border-border-default shrink-0">
                <h2 className="text-sm font-semibold text-text-primary">Marketplace Inquiries</h2>
              </div>
              <nav className="flex-1 overflow-y-auto">
                {inquiriesLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 bg-surface-sunken rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : inquiries.length === 0 ? (
                  <div className="text-center py-10 px-4 text-text-secondary text-sm">
                    No inquiries yet.
                  </div>
                ) : (
                  inquiries.map((inq) => {
                    const isSender = inq.from_user_id === currentUserID;
                    const otherName = isSender
                      ? (inq.to_user_name ?? inq.to_user_email ?? "Photographer")
                      : (inq.from_user_name ?? inq.from_user_email ?? "Client");
                    return (
                      <button
                        key={inq.id}
                        type="button"
                        onClick={() => setSelectedInquiry(inq)}
                        className={`w-full text-left px-4 py-3 border-b border-border-default transition-colors min-h-[60px] ${
                          selectedInquiry?.id === inq.id
                            ? "bg-accent/10"
                            : "hover:bg-surface-sunken/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-text-primary truncate">{otherName}</p>
                          <span className={`status-badge shrink-0 capitalize ${
                            inq.status === "replied" ? "status-badge--success" :
                            inq.status === "declined" ? "status-badge--error" :
                            "status-badge--neutral"
                          }`}>
                            {isSender ? (inq.status === "replied" ? "replied" : "sent") : inq.status}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5 truncate">{inq.message}</p>
                      </button>
                    );
                  })
                )}
              </nav>
            </aside>

            {/* Conversation pane
                Mobile: full width, hidden when no inquiry selected
                Desktop: flex-1, always visible */}
            <div className={`
              flex-col flex-1 min-w-0
              ${selectedInquiry ? "flex" : "hidden md:flex"}
            `}>
              {selectedInquiry ? (
                <InquiryConversation
                  key={selectedInquiry.id}
                  inquiry={selectedInquiry}
                  currentUserID={currentUserID}
                  onBack={() => setSelectedInquiry(null)}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
                  Select an inquiry to view the conversation
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
