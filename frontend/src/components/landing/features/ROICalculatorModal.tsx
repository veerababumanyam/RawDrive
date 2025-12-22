import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calculator, ArrowRight, Clock } from 'lucide-react';
import { AppButton } from '../ui/AppButton';

/* =============================================================================
   ROICalculatorModal Component

   Interactive calculator for time/money savings.
   ============================================================================= */

interface ROICalculatorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ROICalculatorModal: React.FC<ROICalculatorModalProps> = ({
    isOpen,
    onClose
}) => {
    const [eventsPerMonth, setEventsPerMonth] = useState(4);
    const [photosPerEvent, setPhotosPerEvent] = useState(500);
    const [cullingTimePerPhoto] = useState(10); // seconds
    const [hourlyRate, setHourlyRate] = useState(2500); // INR

    // Calculations
    const totalPhotos = eventsPerMonth * photosPerEvent;
    // Manual time: (Total photos * culling seconds) / 3600 = hours
    const manualHoursMonth = (totalPhotos * cullingTimePerPhoto) / 3600;
    // RawDrive AI time: ~90% faster
    const aiHoursMonth = manualHoursMonth * 0.1;
    const hoursSaved = manualHoursMonth - aiHoursMonth;
    const moneySaved = hoursSaved * hourlyRate;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden z-10"
                >
                    {/* Header */}
                    <div className="bg-neutral-900 text-white p-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary-500/20">
                                <Calculator className="w-6 h-6 text-primary-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">ROI Calculator</h3>
                                <p className="text-neutral-400 text-sm">See how much you can save</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8">
                        {/* Inputs */}
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="events-input" className="block text-sm font-medium text-neutral-700 mb-2">
                                    Events per month
                                </label>
                                <input
                                    id="events-input"
                                    type="range"
                                    min="1"
                                    max="20"
                                    value={eventsPerMonth}
                                    onChange={(e) => setEventsPerMonth(Number(e.target.value))}
                                    className="w-full accent-primary-600 mb-2"
                                />
                                <div className="text-right font-bold text-primary-600">{eventsPerMonth} events</div>
                            </div>

                            <div>
                                <label htmlFor="photos-input" className="block text-sm font-medium text-neutral-700 mb-2">
                                    Photos per event
                                </label>
                                <input
                                    id="photos-input"
                                    type="range"
                                    min="100"
                                    max="5000"
                                    step="100"
                                    value={photosPerEvent}
                                    onChange={(e) => setPhotosPerEvent(Number(e.target.value))}
                                    className="w-full accent-primary-600 mb-2"
                                />
                                <div className="text-right font-bold text-primary-600">{photosPerEvent} photos</div>
                            </div>

                            <div>
                                <label htmlFor="rate-input" className="block text-sm font-medium text-neutral-700 mb-2">
                                    Hourly Rate (₹)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">₹</span>
                                    <input
                                        id="rate-input"
                                        type="number"
                                        value={hourlyRate}
                                        onChange={(e) => setHourlyRate(Number(e.target.value))}
                                        className="w-full pl-8 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Results */}
                        <div className="bg-neutral-50 rounded-xl p-6 border border-neutral-200 flex flex-col justify-center gap-6">
                            <div className="text-center">
                                <div className="text-sm text-neutral-500 mb-1">Hours Saved / Month</div>
                                <div className="text-4xl font-bold text-neutral-900 flex items-center justify-center gap-2">
                                    <Clock className="w-6 h-6 text-primary-500" />
                                    {Math.round(hoursSaved)}h
                                </div>
                            </div>

                            <div className="text-center">
                                <div className="text-sm text-neutral-500 mb-1">Money Saved / Month</div>
                                <div className="text-4xl font-bold text-green-600 flex items-center justify-center gap-1">
                                    <span>₹</span>
                                    {Math.round(moneySaved).toLocaleString()}
                                </div>
                            </div>

                            <AppButton variant="primary" className="w-full mt-2">
                                Start Free Trial <ArrowRight className="w-4 h-4" />
                            </AppButton>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ROICalculatorModal;
