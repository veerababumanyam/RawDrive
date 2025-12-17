import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Image,
  FolderOpen,
  Users,
  Eye,
  Download,
  TrendingUp,
  Clock,
  ArrowRight,
  Share2,
  Edit,
  ExternalLink,
  LayoutGrid,
} from 'lucide-react';
import { WorkspaceLayout } from '../../components/workspace';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';

/* =============================================================================
   DashboardPage Component

   Main workspace dashboard with overview stats, recent galleries, and quick actions.
   ============================================================================= */

// Mock data - replace with actual API calls
const mockStats = [
  {
    id: 'galleries',
    label: 'Total Galleries',
    value: 24,
    change: '+3 this month',
    icon: <LayoutGrid size={24} />,
    color: 'primary',
  },
  {
    id: 'photos',
    label: 'Total Photos',
    value: 1847,
    change: '+234 this week',
    icon: <Image size={24} />,
    color: 'accent',
  },
  {
    id: 'clients',
    label: 'Active Clients',
    value: 12,
    change: '+2 this month',
    icon: <Users size={24} />,
    color: 'success',
  },
  {
    id: 'views',
    label: 'Gallery Views',
    value: 3420,
    change: '+18% vs last month',
    icon: <Eye size={24} />,
    color: 'gold',
  },
];

const mockRecentGalleries = [
  {
    id: '1',
    name: 'Johnson Wedding',
    client: 'Sarah & Mike Johnson',
    photoCount: 342,
    coverUrl: 'https://picsum.photos/seed/gallery1/400/300',
    status: 'published',
    views: 128,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    name: 'Corporate Headshots',
    client: 'Tech Corp Inc.',
    photoCount: 45,
    coverUrl: 'https://picsum.photos/seed/gallery2/400/300',
    status: 'draft',
    views: 0,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    name: 'Smith Family Portrait',
    client: 'The Smith Family',
    photoCount: 87,
    coverUrl: 'https://picsum.photos/seed/gallery3/400/300',
    status: 'published',
    views: 56,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    name: 'Product Photography',
    client: 'Fashion Brand Co.',
    photoCount: 156,
    coverUrl: 'https://picsum.photos/seed/gallery4/400/300',
    status: 'published',
    views: 234,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
];

const mockActivity = [
  {
    id: '1',
    type: 'download',
    message: 'Sarah Johnson downloaded 12 photos from "Johnson Wedding"',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: '2',
    type: 'view',
    message: 'New visitor viewed "Smith Family Portrait"',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '3',
    type: 'comment',
    message: 'Mike Johnson commented on a photo in "Johnson Wedding"',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    id: '4',
    type: 'favorite',
    message: 'Sarah Johnson favorited 5 photos in "Johnson Wedding"',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
];

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';
      case 'draft':
        return 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <WorkspaceLayout>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="space-y-8"
      >
        {/* Page Header */}
        <motion.div variants={staggerItem} className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
            <p className="text-text-secondary mt-1">Welcome back! Here's what's happening.</p>
          </div>
          <button
            onClick={() => navigate('/workspace/galleries/new')}
            className="
              flex items-center gap-2
              px-4 py-2.5
              bg-primary hover:bg-primary-hover
              text-white font-medium
              rounded-lg
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
              min-h-[44px]
            "
          >
            <Plus size={20} />
            New Gallery
          </button>
        </motion.div>

        {/* Stats Cards */}
        <motion.div variants={staggerItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {mockStats.map((stat) => (
            <div
              key={stat.id}
              className="bg-surface border border-border rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-text-tertiary">{stat.label}</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">
                    {stat.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-text-tertiary mt-2 flex items-center gap-1">
                    <TrendingUp size={12} className="text-success" />
                    {stat.change}
                  </p>
                </div>
                <div
                  className={`
                    w-12 h-12 rounded-lg flex items-center justify-center
                    ${
                      stat.color === 'primary'
                        ? 'bg-primary-100 text-primary dark:bg-primary-900/30'
                        : stat.color === 'accent'
                        ? 'bg-accent-100 text-accent dark:bg-accent-900/30'
                        : stat.color === 'success'
                        ? 'bg-success-100 text-success dark:bg-success-900/30'
                        : 'bg-gold-100 text-gold dark:bg-gold-900/30'
                    }
                  `}
                >
                  {stat.icon}
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Galleries */}
          <motion.div variants={staggerItem} className="lg:col-span-2">
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-text-primary">Recent Galleries</h2>
                <Link
                  to="/workspace/galleries"
                  className="text-sm text-primary hover:text-primary-hover font-medium flex items-center gap-1"
                >
                  View all
                  <ArrowRight size={14} />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {mockRecentGalleries.map((gallery) => (
                  <div
                    key={gallery.id}
                    className="p-4 hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Cover Image */}
                      <div className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-surface-hover">
                        <img
                          src={gallery.coverUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-text-primary truncate">
                            {gallery.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(
                              gallery.status
                            )}`}
                          >
                            {gallery.status}
                          </span>
                        </div>
                        <p className="text-sm text-text-tertiary truncate">
                          {gallery.client} • {gallery.photoCount} photos
                        </p>
                      </div>

                      {/* Stats */}
                      <div className="hidden sm:flex items-center gap-4 text-sm text-text-tertiary">
                        <span className="flex items-center gap-1">
                          <Eye size={14} />
                          {gallery.views}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatRelativeTime(gallery.createdAt)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/workspace/galleries/${gallery.id}`)}
                          className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                          aria-label="Edit gallery"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                          aria-label="Share gallery"
                        >
                          <Share2 size={16} />
                        </button>
                        {gallery.status === 'published' && (
                          <a
                            href={`/g/${gallery.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                            aria-label="View public gallery"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div variants={staggerItem}>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-text-primary">Recent Activity</h2>
              </div>
              <div className="divide-y divide-border">
                {mockActivity.map((activity) => (
                  <div key={activity.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                          ${
                            activity.type === 'download'
                              ? 'bg-primary-100 text-primary dark:bg-primary-900/30'
                              : activity.type === 'view'
                              ? 'bg-accent-100 text-accent dark:bg-accent-900/30'
                              : activity.type === 'comment'
                              ? 'bg-success-100 text-success dark:bg-success-900/30'
                              : 'bg-gold-100 text-gold dark:bg-gold-900/30'
                          }
                        `}
                      >
                        {activity.type === 'download' && <Download size={14} />}
                        {activity.type === 'view' && <Eye size={14} />}
                        {activity.type === 'comment' && <Users size={14} />}
                        {activity.type === 'favorite' && <Image size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-secondary">{activity.message}</p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {formatRelativeTime(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-border">
                <Link
                  to="/workspace/activity"
                  className="text-sm text-primary hover:text-primary-hover font-medium flex items-center gap-1"
                >
                  View all activity
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div variants={staggerItem}>
          <h2 className="font-semibold text-text-primary mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: 'Create Gallery',
                icon: <Plus size={24} />,
                path: '/workspace/galleries/new',
                color: 'primary',
              },
              {
                label: 'Upload Photos',
                icon: <Image size={24} />,
                path: '/workspace/upload',
                color: 'accent',
              },
              {
                label: 'Add Client',
                icon: <Users size={24} />,
                path: '/workspace/clients/new',
                color: 'success',
              },
              {
                label: 'View Libraries',
                icon: <FolderOpen size={24} />,
                path: '/workspace/libraries',
                color: 'gold',
              },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="
                  flex flex-col items-center justify-center gap-3
                  p-6
                  bg-surface border border-border
                  rounded-xl
                  hover:border-primary hover:shadow-md
                  transition-all duration-200
                  group
                  min-h-[120px]
                "
              >
                <div
                  className={`
                    w-12 h-12 rounded-lg flex items-center justify-center
                    transition-colors
                    ${
                      action.color === 'primary'
                        ? 'bg-primary-100 text-primary group-hover:bg-primary group-hover:text-white dark:bg-primary-900/30'
                        : action.color === 'accent'
                        ? 'bg-accent-100 text-accent group-hover:bg-accent group-hover:text-white dark:bg-accent-900/30'
                        : action.color === 'success'
                        ? 'bg-success-100 text-success group-hover:bg-success group-hover:text-white dark:bg-success-900/30'
                        : 'bg-gold-100 text-gold group-hover:bg-gold group-hover:text-white dark:bg-gold-900/30'
                    }
                  `}
                >
                  {action.icon}
                </div>
                <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </WorkspaceLayout>
  );
};

export default DashboardPage;
