import React from 'react';
import { motion } from 'framer-motion';
import {
    Zap,
    Code,
    Bot,
    Leaf,
} from 'lucide-react';
import { AppCard } from '../ui/AppCard';

/* =============================================================================
   AutomationSection Component

   Highlights integration and automation capabilities (Zapier, API, AI, Green).
   ============================================================================= */

const FEATURES = [
    {
        icon: <Zap className="w-8 h-8 text-amber-500" />,
        title: 'Zapier Integration',
        description: 'Connect with 3,000+ apps including Gmail, Slack, and Mailchimp to automate your busywork.',
        gradient: 'from-amber-500/10 to-orange-500/10'
    },
    {
        icon: <Code className="w-8 h-8 text-cyan-500" />,
        title: 'Open API',
        description: 'Build custom workflows and integrations with our developer-friendly REST API.',
        gradient: 'from-cyan-500/10 to-blue-500/10'
    },
    {
        icon: <Bot className="w-8 h-8 text-purple-500" />,
        title: 'AI Assistant',
        description: 'Smart auto-enhancement and tagging that learns your style over time.',
        gradient: 'from-purple-500/10 to-pink-500/10'
    },
    {
        icon: <Leaf className="w-8 h-8 text-green-500" />,
        title: 'Green Hosting',
        description: 'Carbon-neutral data centers ensure your art doesn’t cost the earth.',
        gradient: 'from-green-500/10 to-emerald-500/10'
    }
];

export const AutomationSection: React.FC = () => {
    return (
        <section className="py-20 lg:py-32 relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950" id="automation">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.06),transparent_60%)]" aria-hidden="true" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="text-center mb-16 max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
                            Built for the <span className="text-gradient bg-gradient-to-r from-accent-400 to-primary-500 bg-clip-text text-transparent">Future of Automation</span>
                        </h2>
                        <p className="text-slate-300 text-lg">
                            RawDrive connects seamlessly with your favorite tools and uses AI to handle the manual tasks you hate.
                        </p>
                    </motion.div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {FEATURES.map((feature, idx) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1, duration: 0.5 }}
                        >
                            <AppCard
                                variant="sm"
                                className={`h-full border border-white/10 hover:border-white/20 transition-colors bg-gradient-to-br ${feature.gradient}`}
                            >
                                <div className="flex flex-col h-full">
                                    <div className="mb-6 p-3 rounded-2xl bg-white/10 w-fit">
                                        {feature.icon}
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                                    <p className="text-slate-300 text-sm leading-relaxed">{feature.description}</p>
                                </div>
                            </AppCard>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default AutomationSection;
