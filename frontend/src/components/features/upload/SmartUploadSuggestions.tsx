import React, { useMemo } from 'react';
import { AlertTriangle, Calendar, X } from 'lucide-react';

// Simple class merger helper
function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}

interface SmartUploadSuggestionsProps {
    files: File[];
    onApplySuggestion: (suggestionType: 'date' | 'camera' | 'quality', action: string) => void;
    onDismiss: () => void;
    className?: string;
}

// Helper to extract basic info
const analyzeFiles = (files: File[]): {
    dateGroups: Record<string, File[]>;
    lowQualityFiles: File[];
} => {
    const dateGroups: Record<string, File[]> = {};
    const lowQualityFiles: File[] = [];

    files.forEach(file => {
        // Group by Date (YYYY-MM-DD)
        const date = new Date(file.lastModified);
        // Format YYYY-MM-DD manually
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
        dateGroups[dateKey].push(file);

        // Low quality check (mock - purely based on file size as proxy for now, < 200KB)
        if (file.size < 200 * 1024 && file.type.startsWith('image/')) {
            lowQualityFiles.push(file);
        }
    });

    return { dateGroups, lowQualityFiles };
};

export const SmartUploadSuggestions: React.FC<SmartUploadSuggestionsProps> = ({
    files,
    onApplySuggestion,
    onDismiss,
    className
}) => {
    const { dateGroups, lowQualityFiles } = useMemo(() => analyzeFiles(files), [files]);

    const dateKeys = Object.keys(dateGroups);
    const multipleDates = dateKeys.length > 1;
    const hasLowQuality = lowQualityFiles.length > 0;

    if (!multipleDates && !hasLowQuality) return null;

    return (
        <div className={cn("bg-surface border border-brand-primary/20 rounded-lg p-4 shadow-lg space-y-4", className)}>
            <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <span className="text-brand-primary">✨</span> Smart Suggestions
                </h3>
                <button onClick={onDismiss} className="text-text-secondary hover:text-text-primary">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="space-y-4">
                {/* Date Grouping Suggestion */}
                {multipleDates && (
                    <div className="bg-surface-alt p-3 rounded-md flex items-start gap-3">
                        <div className="bg-blue-100 p-2 rounded-full text-blue-600 mt-1">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-medium text-text-primary">Organize by Date</h4>
                            <p className="text-sm text-text-secondary mt-1">
                                We detected photos from {dateKeys.length} different days. Would you like to create sub-galleries for each day?
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {dateKeys.slice(0, 3).map(date => (
                                    <span key={date} className="text-xs bg-surface border border-border px-2 py-1 rounded">
                                        {date} ({dateGroups[date].length})
                                    </span>
                                ))}
                                {dateKeys.length > 3 && <span className="text-xs text-text-tertiary self-center">+{dateKeys.length - 3} more</span>}
                            </div>
                            <button
                                onClick={() => onApplySuggestion('date', 'group')}
                                className="mt-3 text-sm bg-brand-primary text-white px-3 py-1.5 rounded hover:bg-brand-secondary transition-colors"
                            >
                                Group by Date
                            </button>
                        </div>
                    </div>
                )}

                {/* Low Quality Warning */}
                {hasLowQuality && (
                    <div className="bg-orange-50 p-3 rounded-md flex items-start gap-3 border border-orange-100">
                        <div className="bg-warning-100 p-2 rounded-full text-warning-600 mt-1">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-medium text-gray-900">Low Quality Logic Detected</h4>
                            <p className="text-sm text-gray-600 mt-1">
                                {lowQualityFiles.length} files appear to be low resolution or small file size.
                            </p>
                            <button
                                onClick={() => onApplySuggestion('quality', 'review')}
                                className="mt-3 text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors"
                            >
                                Review Issues
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
