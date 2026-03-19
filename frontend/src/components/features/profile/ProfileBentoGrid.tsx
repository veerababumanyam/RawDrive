import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../../lib/utils';

interface ProfileBentoGridProps {
  children: React.ReactNode;
  className?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
      when: 'beforeChildren' as const,
    },
  },
};

export const ProfileBentoGrid: React.FC<ProfileBentoGridProps> = ({
  children,
  className = '',
}) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        'gap-3 sm:gap-4 lg:gap-5 xl:gap-6',
        'w-full p-3 sm:p-4 lg:p-6',
        className
      )}
    >
      {children}
    </motion.div>
  );
};
