import { useNavigate } from 'react-router-dom';
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
    Heart,
    MessageCircle,
    Camera,
    Upload,
    ChevronRight,
    Activity,
    Zap,
} from 'lucide-react';

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

const mockStats = [
    {
        id: 'galleries',
        label: 'Galleries',
        value: 24,
        change: '+3',
        trend: 'up',
        icon: LayoutGrid,
        gradient: 'from-violet-500 to-purple-600',
    },
    {
        id: 'photos',
        label: 'Photos',
        value: '1.8K',
        change: '+234',
        trend: 'up',
        icon: Image,
        gradient: 'from-blue-500 to-cyan-500',
    },
    {
        id: 'clients',
        label: 'Clients',
        value: 12,
        change: '+2',
        trend: 'up',
        icon: Users,
        gradient: 'from-emerald-500 to-teal-500',
    },
    {
        id: 'views',
        label: 'Views',
        value: '3.4K',
        change: '+18%',
        trend: 'up',
        icon: Eye,
        gradient: 'from-amber-500 to-orange-500',
    },
];

const mockRecentGalleries = [
    {
        id: '1',
        name: 'Johnson Wedding',
        client: 'Sarah & Mike Johnson',
        photoCount: 342,
        coverUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&h=600&fit=crop',
        status: 'published',
        views: 128,
        likes: 45,
        createdAt: '2d ago',
    },
    {
        id: '2',
        name: 'Corporate Headshots',
        client: 'Tech Corp Inc.',
        photoCount: 45,
        coverUrl: 'https://images.unsplash.com/photo-1560439513-74b037a25d84?w=800&h=600&fit=crop',
        status: 'draft',
        views: 0,
        likes: 0,
        createdAt: '5d ago',
    },
    {
        id: '3',
        name: 'Smith Family Portrait',
        client: 'The Smith Family',
        photoCount: 87,
        coverUrl: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
        status: 'published',
        views: 56,
        likes: 23,
        createdAt: '1w ago',
    },
];

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

const quickActions = [
    { label: 'New Gallery', icon: Plus, gradient: 'from-violet-500 to-purple-600', path: '/new-gallery' },
    { label: 'Upload', icon: Upload, gradient: 'from-blue-500 to-cyan-500', path: '/upload' },
    { label: 'Clients', icon: Users, gradient: 'from-emerald-500 to-teal-500', path: '/clients' },
    { label: 'Libraries', icon: FolderOpen, gradient: 'from-amber-500 to-orange-500', path: '/libraries' },
];

const DashboardPage = () => {
    const navigate = useNavigate();

    return (
        <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
            {/* Page Header */}
            <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-gradient">
                                Dashboard
                            </h1>
                            <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                                Welcome back! Here's your overview
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/workspace/galleries/new')}
                            className="btn-shine flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:scale-95"
                        >
                            <Plus size={20} />
                            <span className="hidden sm:inline">New Gallery</span>
                            <span className="sm:hidden">New</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {mockStats.map((stat) => {
                        const Icon = stat.icon;
                        return (
                            <div
                                key={stat.id}
                                className="group relative overflow-hidden card-glass rounded-2xl p-4 sm:p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />

                                <div className="relative">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`p-2 sm:p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300`}>
                                            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                        </div>
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30">
                                            <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                {stat.change}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
                                            {stat.value}
                                        </div>
                                        <div className="text-xs sm:text-sm text-text-secondary">
                                            {stat.label}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Quick Actions */}
                <div className="card-glass rounded-2xl p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                            <Zap className="w-5 h-5 text-accent" />
                            Quick Actions
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {quickActions.map((action) => {
                            const Icon = action.icon;
                            return (
                                <button
                                    key={action.label}
                                    className="group relative overflow-hidden glass-hover rounded-xl p-4 sm:p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95"
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />

                                    <div className="relative flex flex-col items-center gap-2 sm:gap-3">
                                        <div className={`p-3 sm:p-3.5 rounded-xl bg-gradient-to-br ${action.gradient} shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300`}>
                                            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                        <span className="text-xs sm:text-sm font-medium text-text-primary">
                                            {action.label}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
                    {/* Recent Galleries */}
                    <div className="lg:col-span-2 card-glass rounded-2xl overflow-hidden">
                        <div className="p-4 sm:p-6 border-b border-border/50">
                            <div className="flex items-center justify-between">
                                <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                    <Camera className="w-5 h-5 text-accent" />
                                    Recent Galleries
                                </h2>
                                <button className="text-sm font-medium text-primary hover:text-primary-600 flex items-center gap-1 hover:gap-2 transition-all">
                                    View all
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="divide-y divide-border/50">
                            {mockRecentGalleries.map((gallery) => (
                                <div
                                    key={gallery.id}
                                    className="group p-3 sm:p-4 hover:bg-surface-hover/50 transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        {/* Cover Image */}
                                        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-md group-hover:shadow-lg transition-shadow">
                                            <img
                                                src={gallery.coverUrl}
                                                alt={gallery.name}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                            />
                                            <div
                                                className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                                            />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <h3 className="font-semibold text-text-primary truncate text-sm sm:text-base group-hover:text-primary transition-colors">
                                                    {gallery.name}
                                                </h3>
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${gallery.status === 'published'
                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                    }`}>
                                                    {gallery.status}
                                                </span>
                                            </div>

                                            <p className="text-xs sm:text-sm text-text-secondary truncate mb-2">
                                                {gallery.client}
                                            </p>

                                            <div className="flex items-center gap-3 sm:gap-4 text-xs text-text-tertiary">
                                                <span className="flex items-center gap-1">
                                                    <Image size={14} />
                                                    {gallery.photoCount}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Eye size={14} />
                                                    {gallery.views}
                                                </span>
                                                {gallery.likes > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <Heart size={14} />
                                                        {gallery.likes}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1 ml-auto">
                                                    <Clock size={14} />
                                                    {gallery.createdAt}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors" aria-label="Edit">
                                                <Edit size={18} />
                                            </button>
                                            <button className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors" aria-label="Share">
                                                <Share2 size={18} />
                                            </button>
                                            {gallery.status === 'published' && (
                                                <button className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors" aria-label="View">
                                                    <ExternalLink size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Activity Feed */}
                    <div className="card-glass rounded-2xl overflow-hidden">
                        <div className="p-4 sm:p-6 border-b border-border/50">
                            <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                <Activity className="w-5 h-5 text-accent" />
                                Activity
                            </h2>
                        </div>

                        <div className="divide-y divide-border/50">
                            {mockActivity.map((activity) => (
                                <div
                                    key={activity.id}
                                    className="p-3 sm:p-4 hover:bg-surface-hover/50 transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="relative flex-shrink-0">
                                            <img
                                                src={activity.avatar}
                                                alt={activity.user}
                                                className="w-10 h-10 rounded-full ring-2 ring-white/50 dark:ring-white/10"
                                            />
                                            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-sm ${activity.type === 'download'
                                                    ? 'bg-violet-500'
                                                    : activity.type === 'view'
                                                        ? 'bg-blue-500'
                                                        : activity.type === 'comment'
                                                            ? 'bg-emerald-500'
                                                            : 'bg-pink-500'
                                                }`}>
                                                {activity.type === 'download' && <Download size={12} className="text-white" />}
                                                {activity.type === 'view' && <Eye size={12} className="text-white" />}
                                                {activity.type === 'comment' && <MessageCircle size={12} className="text-white" />}
                                                {activity.type === 'favorite' && <Heart size={12} className="text-white" />}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-text-primary">
                                                <span className="font-semibold">{activity.user}</span>
                                                {' '}
                                                <span className="text-text-secondary">
                                                    {activity.action}
                                                </span>
                                            </p>
                                            <p className="text-xs text-text-tertiary mt-0.5">
                                                {activity.gallery} • {activity.time}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-border/50">
                            <button className="w-full text-sm font-medium text-primary hover:text-primary-600 flex items-center justify-center gap-1 hover:gap-2 transition-all">
                                View all activity
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DashboardPage;