import React from 'react';
import { useParams } from 'react-router-dom';
import { PublicProfileView } from '../../components/features/profile/PublicProfileView';

const PublicProfilePage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();

    if (!slug) {
        return <div className="min-h-screen flex items-center justify-center">Profile not found</div>;
    }

    return <PublicProfileView slug={slug} />;
};

export default PublicProfilePage;
