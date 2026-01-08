import React from 'react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from '../../ui/Modal';
import { GalleryUpload } from '.';

export interface GalleryUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  subGalleryId?: string | null;
  onUploadComplete?: (assetId: string, fileId: string) => void;
  onUploadError?: (error: Error) => void;
  onBatchComplete?: (completedCount: number, failedCount: number) => void;
}

export const GalleryUploadModal: React.FC<GalleryUploadModalProps> = ({
  isOpen,
  onClose,
  galleryId,
  subGalleryId,
  onUploadComplete,
  onUploadError,
  onBatchComplete,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      closeOnBackdropClick
      closeOnEscape
      preventScroll
      centered
      animation="scale"
    >
      <ModalHeader>
        <ModalTitle>Upload photos</ModalTitle>
      </ModalHeader>

      <ModalBody padding="md">
        <GalleryUpload
          galleryId={galleryId}
          subGalleryId={subGalleryId}
          onUploadComplete={onUploadComplete}
          onUploadError={onUploadError}
          onBatchComplete={onBatchComplete}
          className="max-w-4xl mx-auto"
        />
      </ModalBody>
    </Modal>
  );
};

