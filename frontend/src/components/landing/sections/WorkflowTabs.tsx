import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    Layout,
    Megaphone,
    Calendar,
    CreditCard,
    FileText,
    Image,
    Sparkles,
    Download
} from 'lucide-react';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';

/* =============================================================================
   WorkflowTabs Component

   Interactive section showing different use cases (Attract, Manage, Deliver).
   ============================================================================= */

type TabId = 'attract' | 'manage' | 'deliver';

interface WorkflowTab {
    id: TabId;
    label: string;
    icon: React.ReactNode;
    headline: string;
    description: string;
    features: {
        icon: React.ReactNode;
        title: string;
        text: string;
    }[];
    image: string;
}

const TABS: WorkflowTab[] = [
    {
        id: 'attract',
        label: 'Attract',
        icon: <Megaphone className="w-5 h-5" />,
        headline: 'Your Brand, Front and Center',
        description: 'Stand out from the crowd with a stunning public profile and SEO-optimized portfolio that drives qualified leads directly to your inbox.',
        features: [
            {
                icon: <Layout className="w-5 h-5 text-accent-500" />,
                title: 'Public Profile',
                text: 'Showcase your best work with a custom domain portfolio.'
            },
            {
                icon: <Users className="w-5 h-5 text-accent-500" />,
                title: 'Lead Capture',
                text: 'Integrated forms and booking links to capture inquiries.'
            },
            {
                icon: <Sparkles className="w-5 h-5 text-accent-500" />,
                title: 'SEO Optimized',
                text: 'Built-in best practices to help clients find you on Google.'
            }
        ],
        image: '/images/workflow/attract-mockup.png'
    },
    {
        id: 'manage',
        label: 'Manage',
        icon: <Calendar className="w-5 h-5" />,
        headline: 'Never Lose a Lead Again',
        description: 'Streamline your client communications, bookings, and payments with a powerful CRM built specifically for photography studios.',
        features: [
            {
                icon: <Users className="w-5 h-5 text-primary-500" />,
                title: 'Smart CRM',
                text: 'Track every inquiry, shoot, and delivery in one place.'
            },
            {
                icon: <FileText className="w-5 h-5 text-primary-500" />,
                title: 'Contracts & Invoices',
                text: 'Digital signing and automated payment tracking.'
            },
            {
                icon: <CreditCard className="w-5 h-5 text-primary-500" />,
                title: 'Online Payments',
                text: 'Accept payments via UPI, Cards, and Netbanking.'
            }
        ],
        image: '/images/workflow/manage-mockup.png'
    },
    {
        id: 'deliver',
        label: 'Deliver',
        icon: <Image className="w-5 h-5" />,
        headline: 'Delivery That Wows Clients',
        description: 'Exceed expectations with beautiful, mobile-friendly galleries. Smart AI features let clients find their photos instantly.',
        features: [
            {
                icon: <Image className="w-5 h-5 text-gold-500" />,
                title: 'Stunning Galleries',
                text: 'Beautiful uncompressed delivery for web and print.'
            },
            {
                icon: <Sparkles className="w-5 h-5 text-gold-500" />,
                title: 'AI Face Recognition',
                text: 'Clients find their photos in seconds, not hours.'
            },
            {
                icon: <Download className="w-5 h-5 text-gold-500" />,
                title: 'Smart Downloads',
                text: 'Control resolutions and watermarks per user type.'
            }
        ],
        image: '/images/workflow/deliver-mockup.png'
    }
];

export const WorkflowTabs: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabId>('attract');
    const [startTime, setStartTime] = useState<number>(Date.now());

    const currentTab = TABS.find(t => t.id === activeTab) || TABS[0];

    // Analytics stub
    const trackTabUnmount = (_tabId: TabId, _duration: number) => {
        // console.log(`Tab ${_tabId} viewed for ${_duration}ms`);
    };

    const handleTabChange = (newTabId: TabId) => {
        if (newTabId === activeTab) return;

        const duration = Date.now() - startTime;
        trackTabUnmount(activeTab, duration);

        setStartTime(Date.now());
        setActiveTab(newTabId);
    };

    return (
        <section className="py-20 lg:py-32 relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800" id="workflow">
            {/* Background Decor */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.08),transparent_70%)]" aria-hidden="true" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="text-center mb-16 max-w-3xl mx-auto">
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
                        The Complete <span className="text-gradient bg-gradient-to-r from-accent-400 to-primary-500 bg-clip-text text-transparent">Studio Workflow</span>
                    </h2>
                    <p className="text-slate-300 text-lg">
                        From the first inquiry to final album delivery, RawDrive handles the busywork so you can focus on creating.
                    </p>
                </div>

                {/* Tab Navigation */}
                <div className="flex flex-wrap justify-center gap-4 mb-12">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`
                flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-300
                ${activeTab === tab.id
                                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/25 ring-2 ring-primary-500/50'
                                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10'}
              `}
                            aria-selected={activeTab === tab.id}
                            role="tab"
                        >
                            <span className={activeTab === tab.id ? 'text-white' : 'text-slate-400'}>
                                {tab.icon}
                            </span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                        className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center"
                    >
                        {/* Left Content */}
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-3xl font-bold text-white mb-4">
                                    {currentTab.headline}
                                </h3>
                                <p className="text-slate-300 text-lg leading-relaxed">
                                    {currentTab.description}
                                </p>
                            </div>

                            <div className="space-y-4">
                                {currentTab.features.map((feature, idx) => (
                                    <AppCard
                                        key={idx}
                                        variant="sm"
                                        className="flex items-start gap-4 p-4 border border-white/10 hover:border-white/20 transition-colors bg-white/5"
                                    >
                                        <div className="mt-1 flex-shrink-0 p-2 rounded-lg bg-white/10">
                                            {feature.icon}
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-1">{feature.title}</h4>
                                            <p className="text-slate-300 text-sm">{feature.text}</p>
                                        </div>
                                    </AppCard>
                                ))}
                            </div>

                            <div className="pt-4">
                                <AppButton variant="primary" size="lg">
                                    Explore {currentTab.label} Features
                                </AppButton>
                            </div>
                        </div>

                        {/* Right Content - Rich Animated Mockup */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary-500/20 to-accent-500/20 rounded-2xl blur-2xl transform rotate-3" />
                            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl aspect-[4/3]">
                                {/* Browser Frame */}
                                <div className="bg-slate-800/80 border-b border-white/10 px-4 py-3 flex items-center gap-2">
                                    <div className="flex gap-1.5">
                                        <span className="w-3 h-3 rounded-full bg-red-400/80" />
                                        <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                                        <span className="w-3 h-3 rounded-full bg-green-400/80" />
                                    </div>
                                    <div className="flex-1 mx-4">
                                        <div className="bg-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-400 flex items-center gap-2">
                                            <span className="text-green-400">🔒</span>
                                            <span>rawdrive.ai/studio/{currentTab.id}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Mockup Content */}
                                <div className="p-6 relative min-h-[280px]">
                                    {/* Animated gradient background */}
                                    <div className={`absolute inset-0 opacity-30 ${
                                        activeTab === 'attract' ? 'bg-gradient-to-br from-blue-500/30 via-purple-500/20 to-pink-500/30' :
                                        activeTab === 'manage' ? 'bg-gradient-to-br from-green-500/30 via-teal-500/20 to-cyan-500/30' :
                                        'bg-gradient-to-br from-orange-500/30 via-amber-500/20 to-yellow-500/30'
                                    }`} />
                                    
                                    {/* Floating Cards Animation */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        className="relative z-10 grid grid-cols-2 gap-4"
                                    >
                                        {/* Card 1 */}
                                        <motion.div
                                            animate={{ y: [0, -5, 0] }}
                                            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                            className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10"
                                        >
                                            <div className={`w-10 h-10 rounded-lg ${
                                                activeTab === 'attract' ? 'bg-blue-500/30' :
                                                activeTab === 'manage' ? 'bg-green-500/30' :
                                                'bg-orange-500/30'
                                            } flex items-center justify-center mb-3`}>
                                                {currentTab.features[0]?.icon}
                                            </div>
                                            <h5 className="text-white/90 text-sm font-medium mb-1">
                                                {currentTab.features[0]?.title}
                                            </h5>
                                            <p className="text-white/50 text-xs leading-relaxed">
                                                {currentTab.features[0]?.text.slice(0, 40)}...
                                            </p>
                                        </motion.div>

                                        {/* Card 2 */}
                                        <motion.div
                                            animate={{ y: [0, -8, 0] }}
                                            transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", delay: 0.5 }}
                                            className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10"
                                        >
                                            <div className={`w-10 h-10 rounded-lg ${
                                                activeTab === 'attract' ? 'bg-purple-500/30' :
                                                activeTab === 'manage' ? 'bg-teal-500/30' :
                                                'bg-amber-500/30'
                                            } flex items-center justify-center mb-3`}>
                                                {currentTab.features[1]?.icon}
                                            </div>
                                            <h5 className="text-white/90 text-sm font-medium mb-1">
                                                {currentTab.features[1]?.title}
                                            </h5>
                                            <p className="text-white/50 text-xs leading-relaxed">
                                                {currentTab.features[1]?.text.slice(0, 40)}...
                                            </p>
                                        </motion.div>

                                        {/* Card 3 - Full Width */}
                                        <motion.div
                                            animate={{ y: [0, -6, 0] }}
                                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 1 }}
                                            className="col-span-2 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10"
                                        >
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className={`w-10 h-10 rounded-lg ${
                                                    activeTab === 'attract' ? 'bg-pink-500/30' :
                                                    activeTab === 'manage' ? 'bg-cyan-500/30' :
                                                    'bg-yellow-500/30'
                                                } flex items-center justify-center flex-shrink-0`}>
                                                    {currentTab.features[2]?.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h5 className="text-white/90 text-sm font-medium mb-0.5">
                                                        {currentTab.features[2]?.title}
                                                    </h5>
                                                    <p className="text-white/50 text-xs truncate">
                                                        {currentTab.features[2]?.text}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Progress/Stats Bar */}
                                            <div className="flex gap-2 items-center">
                                                <div className={`h-2 rounded-full ${
                                                    activeTab === 'attract' ? 'bg-gradient-to-r from-blue-500 to-purple-500' :
                                                    activeTab === 'manage' ? 'bg-gradient-to-r from-green-500 to-teal-500' :
                                                    'bg-gradient-to-r from-orange-500 to-amber-500'
                                                }`} style={{ width: '60%' }} />
                                                <div className="h-2 bg-white/10 rounded-full flex-1" />
                                                <span className="text-white/40 text-xs font-medium ml-2">
                                                    {activeTab === 'attract' ? '12 leads' : activeTab === 'manage' ? '8 active' : '156 photos'}
                                                </span>
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                    
                                    {/* Floating particles */}
                                    <div className="absolute top-4 right-4">
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                                            className={`w-16 h-16 rounded-full border-2 border-dashed ${
                                                activeTab === 'attract' ? 'border-blue-500/20' :
                                                activeTab === 'manage' ? 'border-green-500/20' :
                                                'border-orange-500/20'
                                            }`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </section>
    );
};

export default WorkflowTabs;
