import React from 'react';
import { CompanyProfileForm } from '../../../components/features/settings/CompanyProfileForm';

const CompanyProfilePage: React.FC = () => {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <CompanyProfileForm />
        </div>
    );
};

export default CompanyProfilePage;
