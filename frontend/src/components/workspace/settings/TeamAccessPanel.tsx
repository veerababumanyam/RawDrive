import React from 'react';
import { Users, UserPlus, Shield } from 'lucide-react';

/**
 * Team & Access Panel
 *
 * Manage workspace team members, roles, and access permissions.
 * Includes member list, role management, and invitation system.
 */

interface TeamAccessPanelProps {
  workspaceId: string;
}

export const TeamAccessPanel: React.FC<TeamAccessPanelProps> = ({ workspaceId }) => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Users size={24} />
          Team Members
        </h2>
        <p className="text-text-secondary mt-1">
          Manage workspace members, roles, and permissions.
        </p>
      </div>

      {/* Team Management Sections */}
      <div className="space-y-6">
        {/* Invite Members Section */}
        <div className="p-6 rounded-xl glass-light border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <UserPlus size={16} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">Invite Team Members</h3>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            Add new team members to your workspace and assign roles.
          </p>
          <div className="p-4 bg-surface/30 rounded-lg text-sm text-text-secondary">
            Team member management UI will be implemented here.
          </div>
        </div>

        {/* Active Members Section */}
        <div className="p-6 rounded-xl glass-light border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users size={16} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">Active Members</h3>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            View and manage current team members and their roles.
          </p>
          <div className="p-4 bg-surface/30 rounded-lg text-sm text-text-secondary">
            Member list and role management will be displayed here.
          </div>
        </div>

        {/* Role Management Section */}
        <div className="p-6 rounded-xl glass-light border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield size={16} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">Roles & Permissions</h3>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            Configure roles and their associated permissions.
          </p>
          <div className="p-4 bg-surface/30 rounded-lg text-sm text-text-secondary">
            Role configuration panel will be displayed here.
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamAccessPanel;
