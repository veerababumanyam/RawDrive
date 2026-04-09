"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { getPublicStream, sendChatMessage, verifyStreamPin, type Stream, type StreamChat } from "@/lib/api/streams";

export default function StreamViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [stream, setStream] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [chatMessages, setChatMessages] = useState<StreamChat[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [userName, setUserName] = useState("Guest");
  const [showChat, setShowChat] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPublicStream(id)
      .then((s) => {
        setStream(s);
        if (s.pin_code) {
          setPinRequired(true);
        }
      })
      .catch(() => setError("Stream not found"))
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handlePinSubmit = useCallback(async () => {
    const valid = await verifyStreamPin(id, pinInput);
    if (valid) {
      setPinRequired(false);
      setPinError("");
    } else {
      setPinError("Invalid PIN. Please try again.");
    }
  }, [id, pinInput]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim()) return;
    try {
      const msg = await sendChatMessage(id, { user_name: userName, message: chatInput.trim() });
      setChatMessages((prev) => [...prev, msg]);
      setChatInput("");
    } catch {
      // Silent fail for chat
    }
  }, [id, chatInput, userName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-white/50 text-lg">Loading stream...</div>
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white mb-2">Stream Not Found</h1>
          <p className="text-white/50">{error || "This stream may have ended or been removed."}</p>
        </div>
      </div>
    );
  }

  if (pinRequired) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full mx-4 bg-white/5 backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-white mb-2 text-center">Private Stream</h2>
          <p className="text-white/50 text-sm text-center mb-6">Enter the PIN to watch this stream</p>
          {pinError && (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-400 text-center">
              {pinError}
            </div>
          )}
          <input
            type="text"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="Enter PIN"
            maxLength={6}
            className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white text-center text-lg tracking-widest placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[44px]"
            onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
            autoFocus
          />
          <button
            onClick={handlePinSubmit}
            className="w-full mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-colors min-h-[44px]"
          >
            Watch Stream
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col lg:flex-row">
      {/* Video Player */}
      <div className="flex-1 flex flex-col">
        <div className="relative aspect-video bg-gray-900 flex items-center justify-center">
          {stream.cf_playback_url && stream.status === "live" ? (
            <iframe
              src={stream.cf_playback_url}
              className="w-full h-full"
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title={stream.title}
            />
          ) : (
            <div className="text-center p-8">
              {stream.status === "live" ? (
                <p className="text-white/50">Connecting to stream...</p>
              ) : stream.status === "ended" || stream.status === "vod_ready" ? (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-medium text-white mb-1">Stream Ended</h2>
                  <p className="text-white/50 text-sm">
                    {stream.duration_seconds > 0
                      ? `Duration: ${Math.round(stream.duration_seconds / 60)} minutes`
                      : "The stream has ended"}
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-medium text-white mb-1">{stream.title}</h2>
                  {stream.scheduled_at && (
                    <p className="text-white/50 text-sm">
                      Starting {new Date(stream.scheduled_at).toLocaleString()}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Live badge */}
          {stream.status === "live" && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE
            </div>
          )}
        </div>

        {/* Stream info */}
        <div className="p-4 border-t border-white/10">
          <h1 className="text-lg font-semibold text-white">{stream.title}</h1>
          {stream.description && (
            <p className="text-sm text-white/50 mt-1">{stream.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-white/30">
            <span>{stream.total_views} views</span>
            {stream.peak_viewers > 0 && <span>Peak: {stream.peak_viewers}</span>}
          </div>
        </div>
      </div>

      {/* Chat Panel */}
      {stream.chat_enabled && (
        <div className={`lg:w-80 border-l border-white/10 flex flex-col ${showChat ? "" : "hidden lg:flex"}`}>
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Live Chat</h3>
            <button
              onClick={() => setShowChat(!showChat)}
              className="lg:hidden p-1 text-white/50 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Toggle chat"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px] lg:max-h-none">
            {chatMessages.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-8">No messages yet. Say hello!</p>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="text-sm">
                  <span className="font-medium text-blue-400">{msg.user_name}: </span>
                  <span className="text-white/80">{msg.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-white/10 space-y-2">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[44px]"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Send a message..."
                className="flex-1 rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[44px]"
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors min-w-[44px] min-h-[44px]"
                aria-label="Send message"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile chat toggle */}
      {stream.chat_enabled && !showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="lg:hidden fixed bottom-4 right-4 rounded-full bg-blue-600 p-3 text-white shadow-lg min-w-[44px] min-h-[44px]"
          aria-label="Open chat"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
