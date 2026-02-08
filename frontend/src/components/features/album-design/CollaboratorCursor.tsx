/**
 * CollaboratorCursor Component
 *
 * Displays a collaborator's cursor position on the canvas.
 */

import React from 'react';

interface CollaboratorCursorProps {
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Collaborator's assigned color */
  color: string;
  /** Collaborator's name */
  name: string;
}

export const CollaboratorCursor: React.FC<CollaboratorCursorProps> = ({
  x,
  y,
  color,
  name,
}) => {
  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-75"
      style={{
        left: x,
        top: y,
        transform: 'translate(-2px, -2px)',
      }}
    >
      {/* Cursor */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
      >
        <path
          d="M5.65376 12.4563L5.65378 12.4563L5.65671 12.4524C5.90252 12.1104 6.30894 11.8931 6.77 11.8931H11.7901L8.73821 3.41476L8.73821 3.41476L8.73556 3.40756C8.6551 3.19027 8.69781 2.94806 8.84813 2.77049C8.99844 2.59291 9.23191 2.50903 9.46124 2.5491L9.46124 2.5491L9.46721 2.55013L21.0107 4.54014L21.0107 4.54015L21.0156 4.54098C21.2309 4.57866 21.4073 4.72217 21.4877 4.92355C21.5682 5.12493 21.5404 5.35469 21.4146 5.53082L21.4146 5.53086L21.4116 5.53501L12.4116 18.2254L12.4116 18.2254L12.4087 18.2293C12.1629 18.5713 11.7565 18.7886 11.2955 18.7886C10.7849 18.7886 10.3373 18.5163 10.1039 18.1043L10.1027 18.1022L10.1016 18.1001L7.42762 13.0521L5.87671 12.7971L5.87671 12.797L5.87083 12.7961C5.65551 12.7584 5.47916 12.6149 5.39872 12.4135C5.31828 12.2122 5.34606 11.9824 5.47186 11.8063L5.47186 11.8063L5.47483 11.8021L5.65376 12.4563ZM5.65376 12.4563L5.47483 11.8021L5.65376 12.4563Z"
          fill={color}
          stroke="white"
          strokeWidth="1"
        />
      </svg>

      {/* Name Label */}
      <div
        className="absolute left-4 top-4 px-1.5 py-0.5 text-xs font-medium text-white rounded whitespace-nowrap"
        style={{ backgroundColor: color }}
      >
        {name}
      </div>
    </div>
  );
};

export default CollaboratorCursor;
