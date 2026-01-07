import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Plus,
  Clock,
  User,
  Mail,
  Phone,
  MapPin,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  Download,
  RefreshCw,
} from 'lucide-react';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

/* =============================================================================
   BookingsPage Component

   Main booking management page showing:
   - Upcoming bookings
   - Booking list with filters
   - Quick stats
   - Actions (confirm, cancel, reschedule)

   Feature: Calendar Integrations & Booking Management
   ============================================================================= */

interface Booking {
  booking_id: string;
  service_type_id: string;
  service_type_name: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'rescheduled';
  payment_status: string;
  start_time: string;
  end_time: string;
  timezone: string;
  location?: string;
  confirmation_code: string;
  source: string;
  created_at: string;
}

interface BookingStats {
  total_bookings: number;
  bookings_this_month: number;
  upcoming_bookings_count: number;
  revenue_this_month_cents: number;
  cancellation_rate_percent: number;
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  no_show: { label: 'No Show', color: 'bg-gray-100 text-gray-800', icon: XCircle },
  rescheduled: { label: 'Rescheduled', color: 'bg-purple-100 text-purple-800', icon: RefreshCw },
};

const formatBookingDate = (dateStr: string): string => {
  const date = parseISO(dateStr);
  if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow at ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, yyyy h:mm a');
};

export default function BookingsPage() {
  const navigate = useNavigate();
  const { workspace: currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.workspace_id;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState<BookingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchBookings = useCallback(async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      params.append('sort_by', 'start_time');
      params.append('sort_order', 'asc');

      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await api.get<{ data: Booking[]; pagination: { pages: number } }>(
        `/api/v1/workspaces/${workspaceId}/bookings?${params.toString()}`
      );
      if (!response.data) throw new Error(response.error?.message || 'Failed to load bookings');

      setBookings(response.data.data as Booking[]);
      setTotalPages(response.data.pagination?.pages || 1);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, statusFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const response = await api.get<{ data: BookingStats }>(`/api/v1/workspaces/${workspaceId}/bookings/stats`);
      if (response.data) setStats(response.data.data);
    } catch (err) {
      console.error('Failed to fetch booking stats:', err);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchBookings();
    fetchStats();
  }, [fetchBookings, fetchStats]);

  const handleConfirm = async (bookingId: string) => {
    try {
      const response = await api.post(`/api/v1/workspaces/${workspaceId}/bookings/${bookingId}/confirm`, {
        payment_status: 'deposit_paid',
      });
      if (!response.data && response.error) throw new Error(response.error.message);
      fetchBookings();
      fetchStats();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to confirm booking');
    }
  };

  const handleCancel = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;

    try {
      const response = await api.post(`/api/v1/workspaces/${workspaceId}/bookings/${bookingId}/cancel`, {
        reason: 'Cancelled by photographer',
      });
      if (!response.data && response.error) throw new Error(response.error.message);
      fetchBookings();
      fetchStats();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to cancel booking');
    }
  };

  const handleComplete = async (bookingId: string) => {
    try {
      const response = await api.post(`/api/v1/workspaces/${workspaceId}/bookings/${bookingId}/complete`);
      if (!response.data && response.error) throw new Error(response.error.message);
      fetchBookings();
      fetchStats();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to complete booking');
    }
  };

  const handleDownloadIcs = async (bookingId: string, confirmationCode: string) => {
    try {
      const response = await api.fetchRaw(
        `/api/v1/workspaces/${workspaceId}/bookings/${bookingId}/ics`
      );

      if (!response.ok) throw new Error('Failed to download');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booking-${confirmationCode}.ics`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download calendar file');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your client appointments and sessions
            </p>
          </div>
          <button
            onClick={() => navigate(`/workspace/${workspaceId}/bookings/new`)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Booking
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Upcoming</p>
                  <p className="text-xl font-semibold">{stats.upcoming_bookings_count}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">This Month</p>
                  <p className="text-xl font-semibold">{stats.bookings_this_month}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total</p>
                  <p className="text-xl font-semibold">{stats.total_bookings}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Cancellation Rate</p>
                  <p className="text-xl font-semibold">{stats.cancellation_rate_percent}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by client name or email..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-black focus:border-transparent"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
                <option value="no_show">No Show</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-600 underline text-sm mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Bookings List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading bookings...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings found</h3>
              <p className="text-gray-500 mb-4">
                {statusFilter || searchQuery
                  ? 'Try adjusting your filters'
                  : 'Create your first booking to get started'}
              </p>
              {!statusFilter && !searchQuery && (
                <button
                  onClick={() => navigate(`/workspace/${workspaceId}/bookings/new`)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                >
                  <Plus className="w-4 h-4" />
                  Create Booking
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {bookings.map((booking) => {
                const statusInfo = statusConfig[booking.status];
                const StatusIcon = statusInfo.icon;
                const startTime = parseISO(booking.start_time);
                const isUpcoming = !isPast(startTime) && ['pending', 'confirmed'].includes(booking.status);

                return (
                  <div
                    key={booking.booking_id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${isUpcoming ? 'border-l-4 border-l-blue-500' : ''
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-gray-900">
                            {booking.service_type_name}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusInfo.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {booking.confirmation_code}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-gray-400" />
                            {formatBookingDate(booking.start_time)}
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4 text-gray-400" />
                            {booking.client_name}
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4 text-gray-400" />
                            {booking.client_email}
                          </div>
                          {booking.client_phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-4 h-4 text-gray-400" />
                              {booking.client_phone}
                            </div>
                          )}
                          {booking.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              {booking.location}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {booking.status === 'pending' && (
                          <button
                            onClick={() => handleConfirm(booking.booking_id)}
                            className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            Confirm
                          </button>
                        )}
                        {booking.status === 'confirmed' && !isPast(startTime) && (
                          <button
                            onClick={() => handleComplete(booking.booking_id)}
                            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            Complete
                          </button>
                        )}
                        {['pending', 'confirmed'].includes(booking.status) && (
                          <button
                            onClick={() => handleCancel(booking.booking_id)}
                            className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDownloadIcs(booking.booking_id, booking.confirmation_code)}
                          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Download calendar file"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
