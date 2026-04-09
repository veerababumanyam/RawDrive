"use client";

import { Star } from "@/components/icons";

interface StarRatingProps {
  rating: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}

export function StarRating({ rating, onChange, readonly = false, size = "md" }: StarRatingProps) {
  const starSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => !readonly && onChange?.(star === rating ? 0 : star)}
          disabled={readonly}
          className={`transition-colors ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110"}`}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          <span className={`${starSize} inline-block ${star <= rating ? "text-amber-400" : "text-secondary/30"}`}>
            <Star />
          </span>
        </button>
      ))}
    </div>
  );
}
