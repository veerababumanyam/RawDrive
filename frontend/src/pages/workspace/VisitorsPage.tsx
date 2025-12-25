import React from 'react';
import { Users, TrendingUp, Eye, MousePointer, Clock, Globe, BarChart3 } from 'lucide-react';

/* =============================================================================
   VisitorsPage Component

   Visitor tracking and lead generation data page.
   Uses centralized design system classes for consistent styling.
   ============================================================================= */

const VisitorsPage: React.FC = () => {
    // Placeholder stats for design
    const stats = [
        { id: 'total', label: 'Total Visitors', value: 0, icon: Users, gradient: 'from-violet-500 to-purple-600' },
        { id: 'unique', label: 'Unique Visitors', value: 0, icon: Eye, gradient: 'from-blue-500 to-cyan-500' },
        { id: 'pageviews', label: 'Page Views', value: 0, icon: MousePointer, gradient: 'from-emerald-500 to-teal-500' },
        { id: 'avgTime', label: 'Avg. Time', value: '0m', icon: Clock, gradient: 'from-amber-500 to-orange-500' },
    ];

    return (
        <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
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
                            <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                                Track visitor engagement and lead generation
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                {/* Stats Grid - Using centralized stat-card classes */}
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

                {/* Lead Generation Section */}
                <div className="glass-card glass-card-hover glass-card-shimmer rounded-2xl overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-border/50">
                        <div className="section-header flex items-center justify-between">
                            <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                                <div className="section-header-icon icon-container-success">
                                    <Users className="w-5 h-5" />
                                </div>
                                Lead Generation
                            </h2>
                        </div>
                    </div>
                    <div className="p-6 sm:p-8">
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="empty-state-icon mb-4">
                                <MousePointer className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-semibold text-text-primary mb-2">
                                No leads captured yet
                            </h3>
                            <p className="text-text-secondary text-center max-w-md">
                                When visitors submit their information through your galleries,
                                their contact details will appear here for easy follow-up.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default VisitorsPage;
