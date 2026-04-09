"use client";

import { useState } from "react";
import type { ProofingComment } from "@/lib/api/proofing";

interface CommentThreadProps {
  comments: ProofingComment[];
  onSubmit: (body: string, parentId?: string, pinX?: number, pinY?: number) => void;
  onPinClick?: (pinX: number, pinY: number) => void;
}

export function CommentThread({ comments, onSubmit, onPinClick }: CommentThreadProps) {
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    onSubmit(newComment.trim(), replyTo ?? undefined);
    setNewComment("");
    setReplyTo(null);
  };

  const topLevel = comments.filter(c => !c.parent_id);
  const replies = (parentId: string) => comments.filter(c => c.parent_id === parentId);

  return (
    <div className="flex flex-col h-full">
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {topLevel.length === 0 && (
          <p className="text-sm text-secondary text-center py-8">No comments yet</p>
        )}
        {topLevel.map(comment => (
          <div key={comment.id} className="space-y-2">
            <CommentBubble
              comment={comment}
              onReply={() => setReplyTo(comment.id)}
              onPinClick={onPinClick}
            />
            {replies(comment.id).map(reply => (
              <div key={reply.id} className="ml-6">
                <CommentBubble
                  comment={reply}
                  onReply={() => setReplyTo(reply.id)}
                  onPinClick={onPinClick}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-glass-border">
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 text-xs text-secondary">
            <span>Replying to comment</span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-accent">Cancel</button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 rounded-lg glass-surface border border-glass-border text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!newComment.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function CommentBubble({
  comment,
  onReply,
  onPinClick,
}: {
  comment: ProofingComment;
  onReply: () => void;
  onPinClick?: (pinX: number, pinY: number) => void;
}) {
  const hasPin = comment.pin_x != null && comment.pin_y != null;
  const time = new Date(comment.created_at).toLocaleString();

  return (
    <div className="glass-surface rounded-xl p-3 border border-glass-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-primary">{comment.author_name}</span>
        <span className="text-xs text-tertiary">{time}</span>
      </div>
      <p className="text-sm text-secondary">{comment.body}</p>
      <div className="flex items-center gap-3 mt-2">
        {hasPin && (
          <button
            onClick={() => onPinClick?.(comment.pin_x!, comment.pin_y!)}
            className="text-xs text-accent hover:underline"
          >
            📍 View pin
          </button>
        )}
        <button onClick={onReply} className="text-xs text-secondary hover:text-primary">
          Reply
        </button>
        {comment.is_resolved && (
          <span className="text-xs text-green-500">✓ Resolved</span>
        )}
      </div>
    </div>
  );
}
