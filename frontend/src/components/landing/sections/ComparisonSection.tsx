import React from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle } from 'lucide-react';
import { AppBadge } from '../ui/AppBadge';

/* =============================================================================
   ComparisonSection Component

   Compares RawDrive features with competitors.
   ============================================================================= */

interface ComparisonFeature {
    name: string;
    rawdrive: boolean | string;
    pixieset: boolean | string;
    gdrive: boolean | string;
    highlight?: boolean;
}

const COMPARISON_DATA: ComparisonFeature[] = [
    { name: 'Photo Proofing & Delivery', rawdrive: true, pixieset: true, gdrive: true },
    { name: 'AI Face Recognition', rawdrive: true, pixieset: false, gdrive: false, highlight: true },
    { name: 'Integrated CRM', rawdrive: true, pixieset: 'Basic', gdrive: false, highlight: true },
    { name: '0% Commision Store', rawdrive: true, pixieset: false, gdrive: false },
    { name: 'Contracts & Invoices', rawdrive: true, pixieset: 'Add-on', gdrive: false },
    { name: 'India-Optimized CDN', rawdrive: true, pixieset: false, gdrive: false, highlight: true },
    { name: 'Custom Domain', rawdrive: true, pixieset: true, gdrive: false },
    { name: 'White Labeling', rawdrive: true, pixieset: 'Higher Tier', gdrive: false },
];

export const ComparisonSection: React.FC = () => {
    const renderCell = (value: boolean | string, isPrimary = false) => {
        if (value === true) {
            return <CheckCircle className={`w-6 h-6 mx-auto ${isPrimary ? 'text-primary-500' : 'text-neutral-400'}`} />;
        }
        if (value === false) {
            return <X className="w-6 h-6 mx-auto text-neutral-300" />;
        }
        return <span className={`text-sm font-medium ${isPrimary ? 'text-primary-600' : 'text-neutral-500'}`}>{value}</span>;
    };

    return (
        <section className="py-20 bg-neutral-50" id="comparison">
            <div className="container mx-auto px-4">
                <div className="text-center mb-16">
                    <AppBadge variant="accent" className="mb-4">Why Switch?</AppBadge>
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">Stop Paying for 5 Different Tools</h2>
                    <p className="text-neutral-500 max-w-2xl mx-auto">
                        RawDrive replaces your gallery host, CRM, contract signer, and file storage—all in one place.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-block min-w-full align-middle"
                    >
                        <div className="rounded-2xl border border-neutral-200 overflow-hidden shadow-xl bg-white">
                            <table className="min-w-full divide-y divide-neutral-200">
                                <thead className="bg-neutral-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-5 text-left text-sm font-semibold text-neutral-500 uppercase tracking-wider w-1/3">
                                            Feature
                                        </th>
                                        <th scope="col" className="px-6 py-5 text-center w-1/4 bg-primary-50/50 border-b-2 border-primary-500">
                                            <div className="text-lg font-bold text-primary-600">RawDrive</div>
                                            <div className="text-xs text-primary-500 font-medium mt-1">All-in-One</div>
                                        </th>
                                        <th scope="col" className="px-6 py-5 text-center w-1/4">
                                            <div className="text-lg font-semibold text-neutral-700">Pixieset</div>
                                            <div className="text-xs text-neutral-400 font-normal mt-1">Galleries Only</div>
                                        </th>
                                        <th scope="col" className="px-6 py-5 text-center w-1/4">
                                            <div className="text-lg font-semibold text-neutral-700">Google Drive</div>
                                            <div className="text-xs text-neutral-400 font-normal mt-1">Storage Only</div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-neutral-200">
                                    {COMPARISON_DATA.map((row, idx) => (
                                        <tr key={row.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900 flex items-center gap-2">
                                                {row.name}
                                                {row.highlight && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                                        Unique
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center bg-primary-50/10">
                                                {renderCell(row.rawdrive, true)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                {renderCell(row.pixieset)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                {renderCell(row.gdrive)}
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Pricing Row */}
                                    <tr className="bg-neutral-900 text-white">
                                        <td className="px-6 py-6 whitespace-nowrap text-sm font-bold">
                                            Monthly Cost (Equivalent)
                                        </td>
                                        <td className="px-6 py-6 whitespace-nowrap text-center text-xl font-bold text-primary-400">
                                            ₹2,000
                                        </td>
                                        <td className="px-6 py-6 whitespace-nowrap text-center text-lg text-neutral-400">
                                            ~₹4,500+
                                        </td>
                                        <td className="px-6 py-6 whitespace-nowrap text-center text-lg text-neutral-400">
                                            ~₹1,600
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 text-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-100 text-green-700 text-sm font-medium border border-green-200">
                                <CheckCircle size={16} />
                                Free Migration Assistance included
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default ComparisonSection;
