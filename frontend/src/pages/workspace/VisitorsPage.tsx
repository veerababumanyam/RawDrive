import React from 'react';
import { Users } from 'lucide-react';

const VisitorsPage: React.FC = () => {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Users className="w-6 h-6" />
                Visitors
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
                Visitor tracking and lead generation data will appear here.
            </p>
            <div className="mt-8 p-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg text-center">
                <p className="text-gray-500">No visitor data available yet.</p>
            </div>
        </div>
    );
};

export default VisitorsPage;
