"use client";

import { useState, useEffect, useRef } from "react";
import { listChannels, getMessages, sendMessage, type Channel, type Message } from "@/lib/api/messaging";
import { getStoredAccessToken } from "@/lib/auth";

export default function MessagesPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = getStoredAccessToken();

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

  // SSE for real-time chat updates
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
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex flex-1 min-h-0">
      {/* Channel sidebar */}
      <aside className="w-72 shrink-0 border-r border-border-default bg-white/[0.02] flex flex-col">
        <div className="p-4 border-b border-border-default flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Channels</h2>
          <button className="surface-button h-8 w-8 p-0">
            +
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {channels.length === 0 ? (
            <div className="text-center py-8 text-text-secondary text-sm">No channels yet</div>
          ) : (
            channels.map((ch) => (
              <button
                key={ch.id}
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
            {/* Channel header */}
            <div className="px-5 py-3 border-b border-border-default flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">
                # {channels.find((c) => c.id === activeChannel)?.name || "Channel"}
              </h3>
            </div>

            {/* Messages */}
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
                      {msg.attachment_url && (
                        <a href={msg.attachment_url} className="text-xs text-accent underline mt-1 block" target="_blank" rel="noopener noreferrer">
                          Attachment
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="px-5 py-3 border-t border-border-default">
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
      </div>
    </div>
  );
}
