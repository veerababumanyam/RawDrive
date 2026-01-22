import React from 'react';
import { cn } from '../../../lib/utils';

interface ProfileBentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export const ProfileBentoGrid: React.FC<ProfileBentoGridProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={cn(
      'grid grid-cols-1 md:grid-cols-4 gap-4 w-full p-4',
      className
    )}>
      {children}
    </div>
  );
};
