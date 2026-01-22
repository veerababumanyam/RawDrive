import React from 'react';

interface ProfileBentoGridProps {
  children: React.ReactNode;
}

export const ProfileBentoGrid: React.FC<ProfileBentoGridProps> = ({ children }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 auto-rows-auto gap-4 md:gap-6 w-full">
      {children}
    </div>
  );
};

interface ProfileBentoItemProps {
  children: React.ReactNode;
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6; // Desktop column span
  rowSpan?: 1 | 2 | 3; // Desktop row span
  className?: string; // Additional classes
}

export const ProfileBentoItem: React.FC<ProfileBentoItemProps> = ({
  children,
  colSpan = 1,
  rowSpan = 1,
  className = '',
}) => {
  // Tailwind class generation for desktop spans
  const colClass = {
    1: 'md:col-span-1',
    2: 'md:col-span-2',
    3: 'md:col-span-3',
    4: 'md:col-span-4',
    5: 'md:col-span-5',
    6: 'md:col-span-6',
  }[colSpan];

  const rowClass = {
    1: 'md:row-span-1',
    2: 'md:row-span-2',
    3: 'md:row-span-3',
  }[rowSpan];

  return (
    <div className={`${colClass} ${rowClass} ${className} w-full`}>
      {children}
    </div>
  );
};
