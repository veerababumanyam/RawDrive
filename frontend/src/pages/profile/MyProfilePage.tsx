import React from 'react';
import { User } from 'lucide-react';
import { PersonalProfileTabContent } from '../../components/settings/PersonalProfileTabContent';

/* =============================================================================
   My Profile Page Component
   ============================================================================= */

/**
 * My Profile Page
 *
 * Allows photographers/professionals to create and manage their public
 * digital visiting card profile. This is a marketing/branding feature
 * that generates a shareable public profile at /u/{slug}
 */
export const MyProfilePage: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <User size={24} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gradient">My Profile</h1>
              <p className="text-text-secondary text-sm mt-0.5">
                Create your professional digital visiting card
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PersonalProfileTabContent />
        </div>
      </div>
    </div>
  );
};

export default MyProfilePage;
