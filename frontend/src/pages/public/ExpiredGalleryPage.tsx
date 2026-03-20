/**
 * ExpiredGalleryPage - Displayed when a gallery has expired (410 response).
 *
 * Shows a professional, responsive page informing the client that the gallery
 * is no longer available, with optional photographer contact info.
 */
import React from 'react';
import { motion } from 'framer-motion';

export interface ExpiredGalleryPageProps {
  /** Name of the gallery */
  galleryName?: string | null;
  /** ISO string of when the gallery expired */
  expiredAt?: string | null;
  /** Photographer or studio name */
  photographerName?: string | null;
}

export const ExpiredGalleryPage: React.FC<ExpiredGalleryPageProps> = ({
  galleryName,
  expiredAt,
  photographerName,
}) => {
  const formattedDate = expiredAt
    ? new Date(expiredAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center p-8 sm:p-12 bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full"
      >
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <svg
            className="h-8 w-8 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="text-2xl sm:text-3xl font-bold mb-3 text-gray-900 dark:text-white">
          Gallery Expired
        </h1>

        {/* Gallery name */}
        {galleryName && (
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            {galleryName}
          </p>
        )}

        {/* Expiration date */}
        {formattedDate && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            This gallery expired on {formattedDate}
          </p>
        )}

        {!formattedDate && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            This gallery is no longer available for viewing or download.
          </p>
        )}

        {/* Contact prompt */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-2">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {photographerName ? (
              <>
                Please contact <span className="font-semibold text-gray-800 dark:text-gray-200">{photographerName}</span> if
                you need access to these photos.
              </>
            ) : (
              <>Please contact the photographer if you need access to these photos.</>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default ExpiredGalleryPage;
