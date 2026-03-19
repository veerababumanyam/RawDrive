import { useState, useEffect } from 'react';

export interface AvatarDisplayProps {
  avatarUrl?: string | null;
  displayName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-16 h-16 text-base',
  lg: 'w-32 h-32 text-2xl',
} as const;

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AvatarDisplay({
  avatarUrl,
  displayName,
  size = 'md',
  className = '',
}: AvatarDisplayProps) {
  const [imgError, setImgError] = useState(false);

  // Reset error state when avatarUrl changes
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const sizeClass = SIZE_CLASSES[size];
  const initials = getInitials(displayName);
  const showImage = avatarUrl && !imgError;

  if (showImage) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className={`rounded-full object-cover ${sizeClass} ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      data-testid="avatar-initials"
      className={`rounded-full flex items-center justify-center bg-[var(--theme-accent,#6366f1)] text-white font-semibold ${sizeClass} ${className}`}
    >
      {initials}
    </div>
  );
}
