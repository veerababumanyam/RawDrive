/**
 * SharePanel - Enhanced gallery sharing component.
 *
 * Wraps the existing ShareMenu and adds Embed Code functionality.
 * Provides QR code, embed code, copy link, social sharing, and Web Share API.
 */

import React, { useState } from 'react';
import { ShareMenu } from '../ShareMenu';
import { EmbedCodeModal } from './EmbedCodeModal';

interface SharePanelProps {
  /** The URL to share */
  shareUrl: string;
  /** Title for social sharing */
  title?: string;
  /** Description for social sharing */
  description?: string;
  /** Size variant for the trigger button */
  buttonSize?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

export const SharePanel: React.FC<SharePanelProps> = (props) => {
  const [showEmbedModal, setShowEmbedModal] = useState(false);

  return (
    <>
      <ShareMenu {...props} />
      <EmbedCodeModal
        galleryUrl={props.shareUrl}
        isOpen={showEmbedModal}
        onClose={() => setShowEmbedModal(false)}
      />
    </>
  );
};

export default SharePanel;
