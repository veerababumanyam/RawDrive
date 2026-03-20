import React from 'react';
import { useProgressiveImage } from '../../../../hooks/useProgressiveImage';

export interface ProgressiveImageProps {
  /** Full-resolution image URL */
  src: string;
  /** Low Quality Image Placeholder data URI for blur-up effect */
  lqip?: string;
  /** Intrinsic image width (for aspect-ratio CLS prevention) */
  width: number;
  /** Intrinsic image height (for aspect-ratio CLS prevention) */
  height: number;
  /** Accessible alt text */
  alt: string;
  /** Additional CSS class on the wrapper */
  className?: string;
  /** Click handler (e.g. open lightbox) */
  onClick?: () => void;
  /** Additional inline styles on the wrapper */
  style?: React.CSSProperties;
}

/**
 * Image component with LQIP blur-up progressive loading.
 *
 * Renders a wrapper `div` with an `aspect-ratio` matching the intrinsic
 * dimensions (preventing CLS), and an `img` that starts blurred at 20px and
 * transitions to sharp over 300ms once the full image loads.
 */
export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  lqip,
  width,
  height,
  alt,
  className,
  onClick,
  style,
}) => {
  const { currentSrc, isLoaded } = useProgressiveImage({ src, lqip });

  return (
    <div
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        aspectRatio: `${width} / ${height}`,
        overflow: 'hidden',
        position: 'relative',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      <img
        src={currentSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          filter: isLoaded ? 'blur(0px)' : 'blur(20px)',
          transform: isLoaded ? 'scale(1)' : 'scale(1.05)',
          transition: 'filter 300ms ease-out, transform 300ms ease-out',
        }}
      />
    </div>
  );
};
