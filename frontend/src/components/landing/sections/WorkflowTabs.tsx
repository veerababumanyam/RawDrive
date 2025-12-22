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
        <section className="py-20 lg:py-32 relative overflow-hidden" id="workflow">
            {/* Background Decor */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="text-center mb-16 max-w-3xl mx-auto">
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-6">
                        The Complete Studio Workflow
                    </h2>
                    <p className="text-neutral-400 text-lg">
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
                                    : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white border border-white/10'}
              `}
                            aria-selected={activeTab === tab.id}
                            role="tab"
                        >
                            <span className={activeTab === tab.id ? 'text-white' : 'text-neutral-500'}>
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
                                <p className="text-neutral-400 text-lg leading-relaxed">
                                    {currentTab.description}
                                </p>
                            </div>

                            <div className="space-y-4">
                                {currentTab.features.map((feature, idx) => (
                                    <AppCard
                                        key={idx}
                                        variant="sm"
                                        className="flex items-start gap-4 p-4 border border-white/5 hover:border-white/20 transition-colors"
                                    >
                                        <div className="mt-1 flex-shrink-0 p-2 rounded-lg bg-white/5">
                                            {feature.icon}
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold mb-1">{feature.title}</h4>
                                            <p className="text-neutral-500 text-sm">{feature.text}</p>
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

                        {/* Right Content - Mockup */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary-500/20 to-accent-500/20 rounded-2xl blur-2xl transform rotate-3" />
                            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-neutral-900/50 shadow-2xl aspect-[4/3] flex items-center justify-center">
                                {/* Placeholder for image - using AppCard or similar to show intent */}
                                <div className="text-center p-8">
                                    <div className="w-20 h-20 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-4">
                                        {currentTab.icon}
                                    </div>
                                    <p className="text-neutral-500 text-sm">Interactive Preview of {currentTab.label}</p>
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
