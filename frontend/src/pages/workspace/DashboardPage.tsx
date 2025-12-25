import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Image,
    FolderOpen,
    Users,
    Eye,
    Download,
    Clock,
    ArrowRight,
    Edit,
    ExternalLink,
    LayoutGrid,
    Heart,
    MessageCircle,
    Camera,
    Upload,
    ChevronRight,
    Activity,
    Zap,
    UserPlus,
    TrendingUp,
    Calendar,
} from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import dashboardService, { DashboardStats } from '../../services/dashboardService';
import galleryService from '../../services/galleryService';
import { clientService } from '../../services/clientService';
import { GalleryListItem } from '../../types/gallery';
import type { ClientAnalyticsResponse, ClientListItem } from '../../types/client';
import { formatDistanceToNow } from 'date-fns';
import { DashboardUploadModal } from '../../components/features/dashboard/DashboardUploadModal';
import { StatusBadge } from '../../components/ui/AppBadge';

/* =============================================================================
   DashboardPage Component

   Main dashboard for the workspace showing:
   - Key stats (galleries, photos, clients, views)
   - Quick actions
   - Recent galleries
   - Activity feed

   NOTE: This page is rendered inside WorkspaceLayout which provides
   the header, sidebar, and main content area structure.
   ============================================================================= */

const mockActivity = [
    {
        id: '1',
        type: 'download',
        user: 'Sarah Johnson',
        action: 'downloaded 12 photos',
        gallery: 'Johnson Wedding',
        time: '30m ago',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    },
    {
        id: '2',
        type: 'view',
        user: 'Guest',
        action: 'viewed gallery',
        gallery: 'Smith Family Portrait',
        time: '2h ago',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest',
    },
    {
        id: '3',
        type: 'comment',
        user: 'Mike Johnson',
        action: 'left a comment',
        gallery: 'Johnson Wedding',
        time: '5h ago',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mike',
    },
    {
        id: '4',
        type: 'favorite',
        user: 'Sarah Johnson',
        action: 'favorited 5 photos',
        gallery: 'Johnson Wedding',
        time: '12h ago',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah2',
    },
];

// Quick actions are defined inside the component to use translations
// See quickActionsData within DashboardPage component

const DashboardPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation(['dashboard', 'common']);
    const { workspace } = useAuth();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentGalleries, setRecentGalleries] = useState<GalleryListItem[]>([]);
    const [recentClients, setRecentClients] = useState<ClientListItem[]>([]);
    const [clientAnalytics, setClientAnalytics] = useState<ClientAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    // Quick actions with translated labels
    const quickActionsData = useMemo(() => [
        { label: t('quickActions.newGallery'), icon: Plus, gradient: 'from-violet-500 to-purple-600', path: '/workspace/galleries/new' },
        { label: t('quickActions.uploadPhotos'), icon: Upload, gradient: 'from-blue-500 to-cyan-500', path: '/workspace/upload' },
        { label: t('common:nav.clients'), icon: Users, gradient: 'from-emerald-500 to-teal-500', path: '/workspace/clients' },
        { label: t('common:nav.libraries'), icon: FolderOpen, gradient: 'from-amber-500 to-orange-500', path: '/workspace/libraries' },
    ], [t]);


    useEffect(() => {
        const loadDashboardData = async () => {
            if (!workspace?.workspace_id) return;

            try {
                const [statsData, galleriesData, clientsData, analyticsData] = await Promise.all([
                    dashboardService.getStats(workspace.workspace_id),
                    galleryService.listGalleries(workspace.workspace_id, {
                        sort: 'created_at',
                        limit: 5
                    }),
                    clientService.listClients(workspace.workspace_id, {
                        limit: 5,
                        sort_by: 'created_at',
                        sort_order: 'desc'
                    }).catch(() => ({ clients: [], meta: null })),
                    clientService.getAnalytics(workspace.workspace_id).catch(() => null)
                ]);

                setStats(statsData);
                setRecentGalleries(galleriesData.data);
                setRecentClients(clientsData.clients);
                setClientAnalytics(analyticsData);
            } catch (error) {
                console.error('Failed to load dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadDashboardData();
    }, [workspace?.workspace_id]);

    const handleQuickAction = (path: string) => {
        if (path === '/workspace/upload') {
            setIsUploadModalOpen(true);
            return;
        }
        navigate(path);
    };

    const statsConfig = [
        {
            id: 'galleries',
            label: t('stats.totalGalleries'),
            value: stats?.galleries || 0,
            change: '+0',
            trend: 'neutral',
            icon: LayoutGrid,
            gradient: 'from-violet-500 to-purple-600',
        },
        {
            id: 'photos',
            label: t('stats.totalPhotos'),
            value: stats?.photos || 0,
            change: '+0',
            trend: 'neutral',
            icon: Image,
            gradient: 'from-blue-500 to-cyan-500',
        },
        {
            id: 'clients',
            label: t('stats.totalClients'),
            value: stats?.clients || 0,
            change: '+0',
            trend: 'neutral',
            icon: Users,
            gradient: 'from-emerald-500 to-teal-500',
        },
        {
            id: 'views',
            label: t('stats.views'),
            value: stats?.views || 0,
            change: '+0%',
            trend: 'neutral',
            icon: Eye,
            gradient: 'from-amber-500 to-orange-500',
        },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
            {/* Page Header */}
            <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-gradient">
                                {t('title')}
                            </h1>
                            <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                                {t('welcomeGeneric')}
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/workspace/galleries/new')}
                            className="btn-shine flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:scale-95"
                        >
                            <Plus size={20} />
                            <span className="hidden sm:inline">{t('common:nav.newGallery')}</span>
                            <span className="sm:hidden">{t('common:actions.create')}</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                {/* Stats Grid - Using centralized stat-card classes */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {statsConfig.map((stat, index) => {
                        const Icon = stat.icon;
                        const cardVariant = index === 0 ? 'stat-card-primary' : index === 1 ? 'stat-card-accent' : index === 2 ? 'stat-card-success' : 'stat-card-warning';
                        return (
                            <div
                                key={stat.id}
                                onClick={() => {
                                    if (stat.id === 'galleries') navigate('/workspace/galleries');
                                    if (stat.id === 'clients') navigate('/workspace/clients');
                                }}
                                className={`group stat-card ${cardVariant} glass-card glass-card-hover glass-card-shimmer rounded-2xl p-4 sm:p-6 cursor-pointer`}
                            >
                                <div className="relative z-10">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`icon-container icon-container-lg rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300`}>
                                            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-2xl sm:text-3xl font-bold text-text-primary mb-1 group-hover:scale-105 transition-transform origin-left">
                                            {stat.value}
                                        </div>
                                        <div className="text-xs sm:text-sm text-text-secondary font-medium">
                                            {stat.label}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Quick Actions - Using centralized glass-card classes */}
                <div className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
                    <div className="section-header mb-4">
                        <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                            <div className="section-header-icon icon-container-accent">
                                <Zap className="w-5 h-5" />
                            </div>
                            {t('sections.quickActions')}
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {quickActionsData.map((action) => {
                            const Icon = action.icon;
                            return (
                                <button
                                    key={action.path}
                                    onClick={() => handleQuickAction(action.path)}
                                    className="group glass-list-item relative overflow-hidden rounded-xl p-4 sm:p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95"
                                >
                                    {/* Gradient overlay on hover */}
                                    <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                                    {/* Shimmer effect */}
                                    <div className="hover-shimmer" />

                                    <div className="relative flex flex-col items-center gap-2 sm:gap-3">
                                        <div className={`icon-container icon-container-lg rounded-xl bg-gradient-to-br ${action.gradient} shadow-lg group-hover:scale-110 group-hover:shadow-xl group-hover:rotate-3 transition-all duration-300`}>
                                            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                        <span className="text-xs sm:text-sm font-medium text-text-primary group-hover:text-primary transition-colors">
                                            {action.label}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Client Insights Summary - Using centralized glass-card classes */}
                {clientAnalytics && (
                    <div className="glass-card glass-card-hover glass-card-shimmer rounded-2xl p-4 sm:p-6">
                        <div className="section-header flex items-center justify-between mb-4">
                            <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                <div className="section-header-icon icon-container-accent">
                                    <Users className="w-5 h-5" />
                                </div>
                                {t('sections.clientInsights', { defaultValue: 'Client Insights' })}
                            </h2>
                            <button
                                onClick={() => navigate('/workspace/clients')}
                                className="text-sm font-medium text-primary hover:text-primary-600 flex items-center gap-1 hover:gap-2 transition-all"
                            >
                                {t('common:actions.viewAll')}
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                            {/* Total Clients */}
                            <div className="group stat-card stat-card-primary glass-list-item rounded-xl p-3 sm:p-4">
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="icon-container icon-container-sm icon-container-primary rounded-lg">
                                            <Users size={14} />
                                        </div>
                                        <span className="text-xs text-text-tertiary font-medium">Total</span>
                                    </div>
                                    <div className="text-xl sm:text-2xl font-bold text-text-primary group-hover:scale-105 transition-transform origin-left">
                                        {clientAnalytics.summary.total_clients}
                                    </div>
                                </div>
                            </div>

                            {/* Active Clients */}
                            <div className="group stat-card stat-card-success glass-list-item rounded-xl p-3 sm:p-4">
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="icon-container icon-container-sm icon-container-success rounded-lg">
                                            <TrendingUp size={14} />
                                        </div>
                                        <span className="text-xs text-text-tertiary font-medium">Active</span>
                                    </div>
                                    <div className="text-xl sm:text-2xl font-bold text-text-primary group-hover:scale-105 transition-transform origin-left">
                                        {clientAnalytics.summary.active_clients}
                                    </div>
                                </div>
                            </div>

                            {/* New This Period */}
                            <div className="group stat-card stat-card-accent glass-list-item rounded-xl p-3 sm:p-4">
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="icon-container icon-container-sm icon-container-accent rounded-lg">
                                            <UserPlus size={14} />
                                        </div>
                                        <span className="text-xs text-text-tertiary font-medium">New</span>
                                    </div>
                                    <div className="text-xl sm:text-2xl font-bold text-text-primary group-hover:scale-105 transition-transform origin-left">
                                        {clientAnalytics.summary.new_clients_period}
                                    </div>
                                </div>
                            </div>

                            {/* Growth Rate */}
                            <div className="group stat-card stat-card-warning glass-list-item rounded-xl p-3 sm:p-4">
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="icon-container icon-container-sm icon-container-warning rounded-lg">
                                            <Calendar size={14} />
                                        </div>
                                        <span className="text-xs text-text-tertiary font-medium">Growth</span>
                                    </div>
                                    <div className="text-xl sm:text-2xl font-bold text-text-primary group-hover:scale-105 transition-transform origin-left">
                                        {clientAnalytics.summary.growth_rate_percent.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Clients Quick View */}
                        {recentClients.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border/50">
                                <div className="flex items-center gap-2 mb-3">
                                    <Clock size={14} className="text-text-tertiary" />
                                    <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Recently Added</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {recentClients.slice(0, 5).map((client) => (
                                        <button
                                            key={client.client_id}
                                            onClick={() => navigate(`/workspace/clients/${client.client_id}`)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-list-item hover:shadow-md transition-all group"
                                        >
                                            {client.avatar_url ? (
                                                <img
                                                    src={client.avatar_url}
                                                    alt={client.full_name}
                                                    className="w-5 h-5 rounded-full object-cover ring-2 ring-white/50"
                                                />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-[10px] font-semibold text-white shadow-sm">
                                                    {client.initials || client.full_name.charAt(0)}
                                                </div>
                                            )}
                                            <span className="text-sm text-text-primary group-hover:text-primary transition-colors">
                                                {client.full_name}
                                            </span>
                                            <StatusBadge status={client.status} size="sm" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Main Content Grid */}
                <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
                    {/* Recent Galleries - Using centralized glass-card classes */}
                    <div className="lg:col-span-2 glass-card glass-card-hover rounded-2xl overflow-hidden">
                        <div className="p-4 sm:p-6 border-b border-border/50">
                            <div className="section-header flex items-center justify-between">
                                <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                    <div className="section-header-icon icon-container-accent">
                                        <Camera className="w-5 h-5" />
                                    </div>
                                    {t('sections.recentGalleries')}
                                </h2>
                                <button
                                    onClick={() => navigate('/workspace/galleries')}
                                    className="text-sm font-medium text-primary hover:text-primary-600 flex items-center gap-1 hover:gap-2 transition-all"
                                >
                                    View all
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="divide-y divide-border/50">
                            {recentGalleries.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="empty-state-icon mx-auto mb-3">
                                        <Camera className="w-8 h-8" />
                                    </div>
                                    <p className="text-text-secondary">{t('empty.noGalleries')}</p>
                                </div>
                            ) : (
                                recentGalleries.map((gallery) => (
                                    <div
                                        key={gallery.gallery_id}
                                        onClick={() => navigate(`/workspace/galleries/${gallery.gallery_id}`)}
                                        className="group row-hover p-3 sm:p-4 cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            {/* Cover Image with enhanced styling */}
                                            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-md group-hover:shadow-xl transition-all duration-300 bg-surface-hover ring-1 ring-border/50 group-hover:ring-primary/30">
                                                {gallery.cover_image_url ? (
                                                    <img
                                                        src={gallery.cover_image_url}
                                                        alt={gallery.title}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
                                                        <Image size={24} className="text-text-tertiary" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <h3 className="font-semibold text-text-primary truncate text-sm sm:text-base group-hover:text-primary transition-colors">
                                                        {gallery.title}
                                                    </h3>
                                                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap shadow-sm ${gallery.status === 'published'
                                                        ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 dark:from-emerald-900/30 dark:to-green-900/30 dark:text-emerald-400'
                                                        : 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 dark:from-amber-900/30 dark:to-orange-900/30 dark:text-amber-400'
                                                        }`}>
                                                        {gallery.status}
                                                    </span>
                                                </div>

                                                <p className="text-xs sm:text-sm text-text-secondary truncate mb-2">
                                                    {gallery.client_name || 'No Client'}
                                                </p>

                                                <div className="flex items-center gap-3 sm:gap-4 text-xs text-text-tertiary">
                                                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-hover/50">
                                                        <Image size={12} />
                                                        {gallery.photo_count}
                                                    </span>
                                                    <span className="flex items-center gap-1 ml-auto">
                                                        <Clock size={12} />
                                                        {formatDistanceToNow(new Date(gallery.created_at), { addSuffix: true })}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions with enhanced styling */}
                                            <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/workspace/galleries/${gallery.gallery_id}`);
                                                    }}
                                                    className="p-2 rounded-xl glass-list-item text-text-tertiary hover:text-primary transition-all hover:scale-110"
                                                    aria-label="Edit"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                {gallery.status === 'published' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.open(`/g/${gallery.gallery_id}`, '_blank');
                                                        }}
                                                        className="p-2 rounded-xl glass-list-item text-text-tertiary hover:text-accent transition-all hover:scale-110"
                                                        aria-label="View"
                                                    >
                                                        <ExternalLink size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Activity Feed - Using centralized glass-card classes */}
                    <div className="glass-card glass-card-hover rounded-2xl overflow-hidden">
                        <div className="p-4 sm:p-6 border-b border-border/50">
                            <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                <div className="section-header-icon icon-container-accent">
                                    <Activity className="w-5 h-5" />
                                </div>
                                {t('sections.recentActivity')}
                            </h2>
                        </div>

                        <div className="divide-y divide-border/50">
                            {mockActivity.map((activity) => (
                                <div
                                    key={activity.id}
                                    className="group row-hover p-3 sm:p-4"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="relative flex-shrink-0">
                                            <img
                                                src={activity.avatar}
                                                alt={activity.user}
                                                className="w-10 h-10 rounded-full ring-2 ring-white/50 dark:ring-white/10 shadow-md group-hover:shadow-lg transition-shadow"
                                            />
                                            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-md ring-2 ring-surface ${activity.type === 'download'
                                                ? 'bg-gradient-to-br from-violet-500 to-purple-600'
                                                : activity.type === 'view'
                                                    ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
                                                    : activity.type === 'comment'
                                                        ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                                                        : 'bg-gradient-to-br from-pink-500 to-rose-500'
                                                }`}>
                                                {activity.type === 'download' && <Download size={10} className="text-white" />}
                                                {activity.type === 'view' && <Eye size={10} className="text-white" />}
                                                {activity.type === 'comment' && <MessageCircle size={10} className="text-white" />}
                                                {activity.type === 'favorite' && <Heart size={10} className="text-white" />}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-text-primary">
                                                <span className="font-semibold group-hover:text-primary transition-colors">{activity.user}</span>
                                                {' '}
                                                <span className="text-text-secondary">
                                                    {activity.action}
                                                </span>
                                            </p>
                                            <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1.5">
                                                <span className="truncate">{activity.gallery}</span>
                                                <span className="text-border">•</span>
                                                <span className="whitespace-nowrap">{activity.time}</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-border/50 bg-gradient-to-t from-surface-hover/30 to-transparent">
                            <button className="w-full text-sm font-medium text-primary hover:text-primary-600 flex items-center justify-center gap-1 hover:gap-2 transition-all py-2 rounded-xl hover:bg-primary/5">
                                {t('common:actions.viewAll')} {t('sections.recentActivity').toLowerCase()}
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            <DashboardUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
            />
        </div>
    );
};

export default DashboardPage;