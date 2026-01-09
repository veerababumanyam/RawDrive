/**
 * UserSettingsPage
 *
 * Container page for user profile settings.
 * Displays the personal profile editor with public visibility toggle.
 * Public profile URL is shown when the profile is set to public.
 */

import { User } from 'lucide-react';
import { PersonalProfileTabContent } from '../../components/settings';

export function UserSettingsPage() {
  return (
    <div className="min-h-full">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <User size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Profile</h1>
            <p className="text-text-secondary">
              Manage your profile information and public visibility
            </p>
          </div>
        </div>
      </div>

      {/* Profile Content - includes public toggle and URL */}
      <div className="py-2">
        <PersonalProfileTabContent />
      </div>
    </div>
  );
}

export default UserSettingsPage;
