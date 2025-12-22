import React from 'react';
import { motion } from 'framer-motion';

/* =============================================================================
   SocialProofBar Component

   Displays an infinite scrolling carousel of partner/client logos.
   ============================================================================= */

// Mock logos (placeholders)
const PARTNERS = [
    'Canon',
    'Sony',
    'Nikon',
    'Fujifilm',
    'Adobe',
    'Capture One',
    'Profoto',
    'Godox',
    'Squarespace',
    'Showit',
    'Pixieset',
    'Pic-Time'
];

export const SocialProofBar: React.FC = () => {
    // We duplicate the list to ensure seamless looping
    const duplicatedPartners = [...PARTNERS, ...PARTNERS];

    return (
        <section className="py-10 bg-white border-b border-neutral-100 overflow-hidden">
            <div className="container mx-auto px-4 mb-6">
                <p className="text-center text-sm font-medium text-neutral-500 uppercase tracking-wider">
                    Trusted by Top Pros and Integration Partners
                </p>
            </div>

            <div className="relative flex overflow-hidden group">
                <motion.div
                    className="flex gap-12 sm:gap-16 md:gap-20 items-center whitespace-nowrap px-4"
                    animate={{
                        x: ['0%', '-50%'],
                    }}
                    transition={{
                        duration: 40,
                        repeat: Infinity,
                        ease: 'linear',
                        repeatType: 'loop',
                    }}
                >
                    {duplicatedPartners.map((partner, index) => (
                        <div
                            key={`${partner}-${index}`}
                            className="flex items-center justify-center opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300"
                        >
                            <span className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neutral-600 to-neutral-500 hover:from-primary-600 hover:to-accent-600">
                                {partner}
                            </span>
                        </div>
                    ))}
                </motion.div>

                {/* Gradient Fade Edges */}
                <div className="absolute top-0 left-0 w-24 h-full bg-gradient-to-r from-white to-transparent pointer-events-none" />
                <div className="absolute top-0 right-0 w-24 h-full bg-gradient-to-l from-white to-transparent pointer-events-none" />
            </div>
        </section>
    );
};

export default SocialProofBar;
