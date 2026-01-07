import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play } from 'lucide-react';

/* =============================================================================
   DemoVideoModal Component

   Modal for displaying the product demo video.
   ============================================================================= */

interface DemoVideoModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Close handler */
    onClose: () => void;
    /** YouTube video ID or custom video URL */
    videoId?: string;
    /** Optional title */
    title?: string;
}

export const DemoVideoModal: React.FC<DemoVideoModalProps> = ({
    isOpen,
    onClose,
    videoId = 'DEMO_VIDEO_ID', // Replace with actual video ID
    title = 'See RawDrive in Action',
}) => {
    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    // Check if we have a real video ID or show placeholder
    const hasRealVideo = videoId !== 'DEMO_VIDEO_ID';

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className="fixed inset-4 sm:inset-10 md:inset-20 z-50 flex items-center justify-center"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="demo-modal-title"
                    >
                        <div className="relative w-full max-w-5xl mx-auto">
                            {/* Close Button */}
                            <button
                                type="button"
                                onClick={onClose}
                                className="
                  absolute -top-12 right-0 p-2 rounded-full
                  bg-white/10 hover:bg-white/20
                  text-white transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500
                "
                                aria-label="Close video"
                            >
                                <X size={24} />
                            </button>

                            {/* Title */}
                            <h2
                                id="demo-modal-title"
                                className="text-xl font-semibold text-white mb-4 text-center"
                            >
                                {title}
                            </h2>

                            {/* Video Container */}
                            <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-white/10">
                                {hasRealVideo ? (
                                    <iframe
                                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                                        title="RawDrive Demo Video"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        className="absolute inset-0 w-full h-full"
                                    />
                                ) : (
                                    /* Placeholder when no video is available */
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
                                            <Play size={40} className="text-white ml-2" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-white mb-2">
                                            Demo Video Coming Soon
                                        </h3>
                                        <p className="text-slate-400 text-center max-w-md">
                                            We're creating an amazing walkthrough to show you all the features RawDrive has to offer.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all"
                                        >
                                            Explore Features Instead
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Video description for SEO */}
                            <p className="sr-only">
                                Watch a 2-minute demo of RawDrive showing how to upload photos, create galleries,
                                and deliver them to your clients with AI-powered organization.
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

DemoVideoModal.displayName = 'DemoVideoModal';

export default DemoVideoModal;
