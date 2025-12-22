import React from 'react';
import { motion } from 'framer-motion';
import {
    ShieldCheck,
    Lock,
    Database,
    Key
} from 'lucide-react';
import { AppCard } from '../ui/AppCard';

/* =============================================================================
   SecuritySection Component

   Highlights enterprise-grade security features.
   ============================================================================= */

const SECURITY_FEATURES = [
    {
        icon: <ShieldCheck className="w-10 h-10 text-emerald-400" />,
        title: 'SOC 2 Certified',
        description: 'Enterprise-grade security standards and compliance monitoring 24/7.'
    },
    {
        icon: <Lock className="w-10 h-10 text-emerald-400" />,
        title: 'Granular Access',
        description: 'Fine-grained permission controls, link expiration, and password protection.'
    },
    {
        icon: <Database className="w-10 h-10 text-emerald-400" />,
        title: 'Global Backup',
        description: 'Real-time redundancy across multiple regions with point-in-time recovery.'
    },
    {
        icon: <Key className="w-10 h-10 text-emerald-400" />,
        title: 'End-to-End Encryption',
        description: 'Your data is encrypted in transit and at rest using industry-standard AES-256.'
    }
];

export const SecuritySection: React.FC = () => {
    return (
        <section className="py-20 lg:py-32 bg-neutral-950 text-white relative overflow-hidden" id="security">
            {/* Background Orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-4xl mx-auto text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
                            <ShieldCheck size={16} />
                            Enterprise Security
                        </div>
                        <h2 className="text-3xl md:text-5xl font-bold mb-6">
                            Bank-Grade Security for Your Art
                        </h2>
                        <p className="text-neutral-400 text-lg">
                            We protect your intellectual property with the same level of security used by major financial institutions.
                        </p>
                    </motion.div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
                    {SECURITY_FEATURES.map((feature, idx) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                        >
                            <AppCard
                                variant="sm"
                                className="flex items-start gap-5 p-6 border border-white/5 bg-white/5 hover:bg-white/10 transition-colors"
                                title={feature.title}
                                description={feature.description}
                            >
                                <div className="shrink-0 p-3 rounded-xl bg-emerald-500/10">
                                    {feature.icon}
                                </div>
                            </AppCard>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default SecuritySection;
