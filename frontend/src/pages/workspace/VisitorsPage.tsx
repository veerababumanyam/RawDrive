import React from 'react';
import { Users, TrendingUp, Eye, MousePointer, Clock, Globe, BarChart3, Download, ChevronDown } from 'lucide-react';

/* =============================================================================
   VisitorsPage Component

   Visitor tracking and lead generation data page.
   Uses centralized design system classes for consistent styling.
   ============================================================================= */

const VisitorsPage: React.FC = () => {
    // Placeholder stats for design
    const stats = [
        { id: 'total', label: 'Total Visitors', value: 0, icon: Users, gradient: 'from-violet-500 to-purple-600', description: 'Total number of sessions across all galleries' },
        { id: 'unique', label: 'Unique Visitors', value: 0, icon: Eye, gradient: 'from-blue-500 to-cyan-500', description: 'The number of distinct people who visited your galleries (based on browser fingerprinting)' },
        { id: 'pageviews', label: 'Page Views', value: 0, icon: MousePointer, gradient: 'from-emerald-500 to-teal-500', description: 'Total number of individual pages viewed' },
        { id: 'avgTime', label: 'Avg. Time', value: '0m', icon: Clock, gradient: 'from-amber-500 to-orange-500', description: 'Average time spent per session' },
    ];

    return (
        <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 pb-12">
            {/* Page Header */}
            <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                                <div className="section-header-icon icon-container-accent">
                                    <Users className="w-5 h-5" />
                                </div>
                                Visitors
                            </h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                className="px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-all flex items-center gap-2 border border-white/20"
                                onClick={() => console.log('Export logs')}
                            >
                                <Download size={16} />
                                <span className="hidden sm:inline">Export Logs</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative group">
                        <select className="appearance-none pl-10 pr-10 py-2.5 glass-light border border-white/20 dark:border-white/10 rounded-xl text-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer min-w-[160px]">
                            <option value="">All Devices</option>
                            <option value="desktop">Desktop</option>
                            <option value="mobile">Mobile</option>
                            <option value="tablet">Tablet</option>
                        </select>
                        <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    </div>
                    <div className="relative group">
                        <select className="appearance-none pl-10 pr-10 py-2.5 glass-light border border-white/20 dark:border-white/10 rounded-xl text-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer min-w-[160px]">
                            <option value="">All Locations</option>
                            <option value="US">United States</option>
                            <option value="UK">United Kingdom</option>
                            <option value="IN">India</option>
                        </select>
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {stats.map((stat, index) => {
                        const Icon = stat.icon;
                        const cardVariant = index === 0 ? 'stat-card-primary' : index === 1 ? 'stat-card-accent' : index === 2 ? 'stat-card-success' : 'stat-card-warning';
                        return (
                            <div
                                key={stat.id}
                                className={`group stat-card ${cardVariant} glass-card glass-card-hover glass-card-shimmer rounded-2xl p-4 sm:p-6`}
                            >
                                <div className="relative z-10">
                                    <div className="flex items-start justify-between mb-3">
                                        <div
                                            className={`icon-container icon-container-lg rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300`}
                                            title={stat.description}
                                        >
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

                {/* Main Content Grid */}
                <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
                    {/* Traffic Sources */}
                    <div className="lg:col-span-2 glass-card glass-card-hover rounded-2xl overflow-hidden">
                        <div className="p-4 sm:p-6 border-b border-border/50">
                            <div className="section-header flex items-center justify-between">
                                <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                    <div className="section-header-icon icon-container-accent">
                                        <Globe className="w-5 h-5" />
                                    </div>
                                    Traffic Sources
                                </h2>
                            </div>
                        </div>
                        <div className="p-6 sm:p-8">
                            <div className="flex flex-col items-center justify-center py-8">
                                <div className="empty-state-icon mb-4">
                                    <BarChart3 className="w-8 h-8" />
                                </div>
                                <p className="text-text-secondary text-center">
                                    No traffic data available yet.
                                </p>
                                <p className="text-text-tertiary text-sm text-center mt-2">
                                    Traffic sources will appear here once visitors start viewing your galleries.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="glass-card glass-card-hover rounded-2xl overflow-hidden">
                        <div className="p-4 sm:p-6 border-b border-border/50">
                            <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                <div className="section-header-icon icon-container-accent">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                Recent Activity
                            </h2>
                        </div>
                        <div className="p-6 sm:p-8">
                            <div className="flex flex-col items-center justify-center py-8">
                                <div className="empty-state-icon mb-4">
                                    <Users className="w-8 h-8" />
                                </div>
                                <p className="text-text-secondary text-center">
                                    No recent activity.
                                </p>
                                <p className="text-text-tertiary text-sm text-center mt-2">
                                    Visitor activity will be tracked here.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Visitor Sessions Table */}
                <div className="glass-card glass-card-hover rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 sm:p-6 border-b border-border/50 flex items-center justify-between">
                        <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                            <div className="section-header-icon icon-container-accent">
                                <Clock className="w-5 h-5" />
                            </div>
                            Visitor Sessions
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-surface-hover/50 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Visitor</th>
                                    <th className="px-6 py-4">Location</th>
                                    <th className="px-6 py-4">Device</th>
                                    <th className="px-6 py-4">Galleries</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Last Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-text-tertiary">
                                        <div className="flex flex-col items-center">
                                            <Users className="w-8 h-8 opacity-20 mb-2" />
                                            No visitor sessions recorded yet.
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 border-t border-border/50 flex items-center justify-between bg-surface-hover/30">
                        <span className="text-sm text-text-tertiary">Showing 0 of 0 sessions</span>
                        <div className="flex items-center gap-2">
                            <button disabled className="px-3 py-1 text-xs font-medium border border-border/50 rounded-lg opacity-50">Prev</button>
                            <button disabled className="px-3 py-1 text-xs font-medium border border-border/50 rounded-lg opacity-50">Next</button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default VisitorsPage;
