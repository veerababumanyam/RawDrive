/**
 * GuestManager: Manage invitation guests with CSV import
 *
 * Features:
 * - Guest list with filtering and search
 * - CSV file upload and import
 * - Column mapping interface
 * - Bulk actions (invite, remind, delete)
 * - Guest statistics dashboard
 *
 * Feature: 016-save-the-date Microservice Enhancement
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Upload,
  Download,
  Search,
  Filter,
  MoreHorizontal,
  Mail,
  Trash2,
  Check,
  X,
  HelpCircle,
  FileSpreadsheet,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { apiClient } from '@/services/api';

interface Guest {
  guest_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'pending' | 'invited' | 'viewed' | 'rsvp_yes' | 'rsvp_no' | 'rsvp_maybe';
  plus_ones: number;
  group_name: string | null;
  dietary_restrictions: string | null;
  created_at: string;
}

interface GuestStats {
  total_guests: number;
  pending: number;
  invited: number;
  viewed: number;
  rsvp_yes: number;
  rsvp_no: number;
  rsvp_maybe: number;
  total_plus_ones: number;
  response_rate: number;
}

interface CSVPreview {
  columns: string[];
  sample_rows: string[][];
  total_rows: number;
  valid_rows: number;
}

interface GuestManagerProps {
  workspaceId: string;
  invitationId: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  invited: 'bg-blue-100 text-blue-700',
  viewed: 'bg-purple-100 text-purple-700',
  rsvp_yes: 'bg-green-100 text-green-700',
  rsvp_no: 'bg-red-100 text-red-700',
  rsvp_maybe: 'bg-yellow-100 text-yellow-700',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  invited: 'Invited',
  viewed: 'Viewed',
  rsvp_yes: 'Attending',
  rsvp_no: 'Declined',
  rsvp_maybe: 'Maybe',
};

export const GuestManager: React.FC<GuestManagerProps> = ({
  workspaceId,
  invitationId,
}) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [stats, setStats] = useState<GuestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchGuests = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: '50',
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });

      const response = await apiClient.get<{
        guests: Guest[];
        total: number;
        has_more: boolean;
      }>(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/guests?${params}`
      );

      if (response.data) {
        setGuests(response.data.guests);
        setHasMore(response.data.has_more);
      }
    } catch (error) {
      console.error('Failed to fetch guests:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, invitationId, page, search, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await apiClient.get<GuestStats>(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/guests/stats`
      );
      if (response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [workspaceId, invitationId]);

  useEffect(() => {
    fetchGuests();
    fetchStats();
  }, [fetchGuests, fetchStats]);

  const handleSelectAll = () => {
    if (selectedGuests.size === guests.length) {
      setSelectedGuests(new Set());
    } else {
      setSelectedGuests(new Set(guests.map((g) => g.guest_id)));
    }
  };

  const handleSelectGuest = (guestId: string) => {
    const newSelected = new Set(selectedGuests);
    if (newSelected.has(guestId)) {
      newSelected.delete(guestId);
    } else {
      newSelected.add(guestId);
    }
    setSelectedGuests(newSelected);
  };

  const handleBulkAction = async (action: 'invite' | 'delete') => {
    if (selectedGuests.size === 0) return;

    try {
      if (action === 'invite') {
        await apiClient.post(
          `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/guests/bulk-status`,
          {
            guest_ids: Array.from(selectedGuests),
            status: 'invited',
          }
        );
      }
      // Refresh
      fetchGuests();
      fetchStats();
      setSelectedGuests(new Set());
    } catch (error) {
      console.error('Bulk action failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AppCard className="p-4">
            <div className="text-2xl font-bold text-text-primary">
              {stats.total_guests}
            </div>
            <div className="text-sm text-text-secondary">Total Guests</div>
          </AppCard>
          <AppCard className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {stats.rsvp_yes}
            </div>
            <div className="text-sm text-text-secondary">Attending</div>
          </AppCard>
          <AppCard className="p-4">
            <div className="text-2xl font-bold text-red-600">
              {stats.rsvp_no}
            </div>
            <div className="text-sm text-text-secondary">Declined</div>
          </AppCard>
          <AppCard className="p-4">
            <div className="text-2xl font-bold text-primary">
              {stats.response_rate}%
            </div>
            <div className="text-sm text-text-secondary">Response Rate</div>
          </AppCard>
        </div>
      )}

      {/* Toolbar */}
      <AppCard className="p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-3 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search guests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-border rounded-lg text-sm w-64"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => setShowImportModal(true)}
              leftIcon={<Upload className="w-4 h-4" />}
            >
              Import CSV
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-4 h-4" />}
            >
              Export
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => {
                fetchGuests();
                fetchStats();
              }}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Refresh
            </AppButton>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedGuests.size > 0 && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-4">
            <span className="text-sm text-text-secondary">
              {selectedGuests.size} selected
            </span>
            <AppButton
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('invite')}
              leftIcon={<Mail className="w-4 h-4" />}
            >
              Send Invitations
            </AppButton>
            <AppButton
              size="sm"
              variant="outline"
              className="text-error"
              onClick={() => handleBulkAction('delete')}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Delete
            </AppButton>
          </div>
        )}
      </AppCard>

      {/* Guest List */}
      <AppCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedGuests.size === guests.length && guests.length > 0}
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="p-3 text-left text-sm font-medium text-text-secondary">
                  Name
                </th>
                <th className="p-3 text-left text-sm font-medium text-text-secondary">
                  Email
                </th>
                <th className="p-3 text-left text-sm font-medium text-text-secondary">
                  Status
                </th>
                <th className="p-3 text-left text-sm font-medium text-text-secondary">
                  Plus Ones
                </th>
                <th className="p-3 text-left text-sm font-medium text-text-secondary">
                  Group
                </th>
                <th className="p-3 text-left text-sm font-medium text-text-secondary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-text-secondary">
                    Loading guests...
                  </td>
                </tr>
              ) : guests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-12 h-12 text-text-tertiary" />
                      <p className="text-text-secondary">No guests yet</p>
                      <AppButton
                        size="sm"
                        onClick={() => setShowImportModal(true)}
                        leftIcon={<Upload className="w-4 h-4" />}
                      >
                        Import from CSV
                      </AppButton>
                    </div>
                  </td>
                </tr>
              ) : (
                guests.map((guest) => (
                  <tr
                    key={guest.guest_id}
                    className="border-b border-border hover:bg-surface-alt/50"
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedGuests.has(guest.guest_id)}
                        onChange={() => handleSelectGuest(guest.guest_id)}
                        className="rounded"
                      />
                    </td>
                    <td className="p-3 font-medium text-text-primary">
                      {guest.name}
                    </td>
                    <td className="p-3 text-text-secondary">
                      {guest.email || '-'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[guest.status]
                        }`}
                      >
                        {STATUS_LABELS[guest.status]}
                      </span>
                    </td>
                    <td className="p-3 text-text-secondary">
                      {guest.plus_ones > 0 ? `+${guest.plus_ones}` : '-'}
                    </td>
                    <td className="p-3 text-text-secondary">
                      {guest.group_name || '-'}
                    </td>
                    <td className="p-3">
                      <button className="p-1 hover:bg-surface-alt rounded">
                        <MoreHorizontal className="w-4 h-4 text-text-tertiary" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {guests.length > 0 && (
          <div className="p-4 border-t border-border flex justify-between items-center">
            <span className="text-sm text-text-secondary">
              Page {page}
            </span>
            <div className="flex gap-2">
              <AppButton
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </AppButton>
            </div>
          </div>
        )}
      </AppCard>

      {/* Import Modal would go here */}
      {showImportModal && (
        <CSVImportModal
          workspaceId={workspaceId}
          invitationId={invitationId}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            fetchGuests();
            fetchStats();
          }}
        />
      )}
    </div>
  );
};

// CSV Import Modal Component
interface CSVImportModalProps {
  workspaceId: string;
  invitationId: string;
  onClose: () => void;
  onImportComplete: () => void;
}

const CSVImportModal: React.FC<CSVImportModalProps> = ({
  workspaceId,
  invitationId,
  onClose,
  onImportComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [mapping, setMapping] = useState({
    name_column: '',
    email_column: '',
    phone_column: '',
    group_column: '',
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'map' | 'confirm'>('upload');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await apiClient.post<CSVPreview>(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/guests/import/preview`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (!response.data) return;
      setPreview(response.data);

      // Auto-detect columns
      const columns = response.data.columns;
      const nameCol = columns.find((c: string) =>
        c.toLowerCase().includes('name')
      );
      const emailCol = columns.find((c: string) =>
        c.toLowerCase().includes('email')
      );
      const phoneCol = columns.find((c: string) =>
        c.toLowerCase().includes('phone')
      );
      const groupCol = columns.find((c: string) =>
        c.toLowerCase().includes('group')
      );

      setMapping({
        name_column: nameCol || columns[0] || '',
        email_column: emailCol || '',
        phone_column: phoneCol || '',
        group_column: groupCol || '',
      });

      setStep('map');
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      Object.entries(mapping).forEach(([key, value]) => {
        if (value) formData.append(key, value);
      });

      await apiClient.post(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/guests/import`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      onImportComplete();
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <AppCard className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Import Guests from CSV</h2>
            <button onClick={onClose} className="p-1 hover:bg-surface-alt rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {step === 'upload' && (
            <div className="text-center py-12">
              <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-text-tertiary" />
              <h3 className="text-lg font-medium mb-2">Upload your guest list</h3>
              <p className="text-text-secondary mb-6">
                Upload a CSV file with guest names, emails, and other details
              </p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <span className="px-6 py-3 bg-primary text-white rounded-lg cursor-pointer hover:bg-primary/90">
                  {loading ? 'Processing...' : 'Select CSV File'}
                </span>
              </label>
            </div>
          )}

          {step === 'map' && preview && (
            <div>
              <div className="mb-6">
                <p className="text-sm text-text-secondary mb-4">
                  Found {preview.total_rows} rows. Map your columns:
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {['name_column', 'email_column', 'phone_column', 'group_column'].map(
                    (field) => (
                      <div key={field}>
                        <label className="block text-sm font-medium mb-1 capitalize">
                          {field.replace('_column', '').replace('_', ' ')}
                          {field === 'name_column' && (
                            <span className="text-error">*</span>
                          )}
                        </label>
                        <select
                          value={mapping[field as keyof typeof mapping]}
                          onChange={(e) =>
                            setMapping({ ...mapping, [field]: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-border rounded-lg"
                        >
                          <option value="">-- Select --</option>
                          {preview.columns.map((col: string) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <AppButton variant="outline" onClick={() => setStep('upload')}>
                  Back
                </AppButton>
                <AppButton
                  onClick={handleImport}
                  disabled={!mapping.name_column || loading}
                >
                  {loading ? 'Importing...' : `Import ${preview.valid_rows} Guests`}
                </AppButton>
              </div>
            </div>
          )}
        </div>
      </AppCard>
    </div>
  );
};

export default GuestManager;
