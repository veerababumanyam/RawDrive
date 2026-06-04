"use client";

import { Star } from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}

export function StarRating({
  rating,
  onChange,
  readonly = false,
  size = "md",
}: StarRatingProps) {
  const starSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const buttonSize = size === "sm" ? "sm" : "md";

  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label="Star rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= rating;
        const label = `${star} star${star !== 1 ? "s" : ""}`;
        const icon = (
          <span
            className={cn(
              starSize,
              "inline-block",
              active ? "rating-star" : "text-text-tertiary",
            )}
          >
            <Star />
          </span>
        );

        return readonly ? (
          <span
            key={star}
            aria-label={label}
            className="inline-flex items-center justify-center"
          >
            {icon}
          </span>
        ) : (
          <GlassIconButton
            key={star}
            size={buttonSize}
            variant="ghost"
            label={label}
            active={active}
            onClick={() => onChange?.(star === rating ? 0 : star)}
          >
            {icon}
          </GlassIconButton>
        );
      })}
    </div>
  );
}
