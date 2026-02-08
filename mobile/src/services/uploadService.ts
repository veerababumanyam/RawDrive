/**
 * Upload service for mobile app
 * Handles image/video uploads with progress tracking and resume capability
 */

import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { getStoredTokens } from './secureStorage';
import { getCurrentWorkspaceId } from './api';
import { UPLOAD_CONFIG } from '../constants';
import type { UploadItem } from '../types';

// Get upload service URL from config
function getUploadServiceUrl(): string {
  const extra = Constants.expoConfig?.extra;
  return extra?.apiUrl?.replace('/api/v1', '') || 'http://localhost:8008';
}

const UPLOAD_SERVICE_URL = getUploadServiceUrl();

// Upload queue management
type UploadCallback = (item: UploadItem) => void;
let uploadQueue: UploadItem[] = [];
let isProcessing = false;
let onProgressCallbacks: Map<string, UploadCallback> = new Map();
let onCompleteCallbacks: Map<string, UploadCallback> = new Map();
let onErrorCallbacks: Map<string, UploadCallback> = new Map();

/**
 * Request camera roll permissions
 */
export async function requestMediaLibraryPermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Request camera permissions
 */
export async function requestCameraPermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

/**
 * Pick images from camera roll
 */
export async function pickImages(options?: {
  allowsMultipleSelection?: boolean;
  mediaTypes?: ImagePicker.MediaTypeOptions;
  quality?: number;
}): Promise<ImagePicker.ImagePickerAsset[]> {
  const hasPermission = await requestMediaLibraryPermissions();
  if (!hasPermission) {
    throw new Error('Permission to access media library was denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options?.mediaTypes ?? ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: options?.allowsMultipleSelection ?? true,
    quality: options?.quality ?? 1,
    exif: true,
  });

  if (result.canceled) {
    return [];
  }

  return result.assets;
}

/**
 * Take a photo with camera
 */
export async function takePhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const hasPermission = await requestCameraPermissions();
  if (!hasPermission) {
    throw new Error('Permission to access camera was denied');
  }

  const result = await ImagePicker.launchCameraAsync({
    quality: 1,
    exif: true,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return result.assets[0];
}

/**
 * Generate a unique upload ID
 */
function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get file info from URI
 */
async function getFileInfo(
  uri: string
): Promise<{ size: number; exists: boolean }> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return {
      size: (info as any).size || 0,
      exists: info.exists,
    };
  } catch {
    return { size: 0, exists: false };
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Validate file before upload
 */
function validateFile(
  mimeType: string,
  size: number
): { valid: boolean; error?: string } {
  // Check supported types
  const isImage = UPLOAD_CONFIG.SUPPORTED_IMAGE_TYPES.includes(mimeType);
  const isVideo = UPLOAD_CONFIG.SUPPORTED_VIDEO_TYPES.includes(mimeType);

  if (!isImage && !isVideo) {
    return { valid: false, error: 'Unsupported file type' };
  }

  // Check size limits
  if (isImage && size > UPLOAD_CONFIG.MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `Image exceeds maximum size of ${UPLOAD_CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB`,
    };
  }

  if (isVideo && size > UPLOAD_CONFIG.MAX_VIDEO_SIZE) {
    return {
      valid: false,
      error: `Video exceeds maximum size of ${UPLOAD_CONFIG.MAX_VIDEO_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

/**
 * Add files to upload queue
 */
export async function addToUploadQueue(
  galleryId: string,
  assets: ImagePicker.ImagePickerAsset[]
): Promise<UploadItem[]> {
  const items: UploadItem[] = [];

  for (const asset of assets) {
    const fileInfo = await getFileInfo(asset.uri);
    const filename = asset.fileName || `photo_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || getMimeType(filename);

    const validation = validateFile(mimeType, fileInfo.size);
    if (!validation.valid) {
      console.warn(`Skipping ${filename}: ${validation.error}`);
      continue;
    }

    const uploadItem: UploadItem = {
      id: generateUploadId(),
      uri: asset.uri,
      filename,
      mimeType,
      size: fileInfo.size,
      status: 'pending',
      progress: 0,
      galleryId,
    };

    items.push(uploadItem);
    uploadQueue.push(uploadItem);
  }

  // Start processing if not already
  if (!isProcessing) {
    processQueue();
  }

  return items;
}

/**
 * Process upload queue
 */
async function processQueue(): Promise<void> {
  if (isProcessing || uploadQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (uploadQueue.length > 0) {
    const item = uploadQueue.find((i) => i.status === 'pending');
    if (!item) break;

    await uploadFile(item);
  }

  isProcessing = false;
}

/**
 * Upload a single file
 */
async function uploadFile(item: UploadItem): Promise<void> {
  item.status = 'uploading';
  notifyProgress(item);

  try {
    const tokens = await getStoredTokens();
    const workspaceId = getCurrentWorkspaceId();

    if (!tokens?.accessToken) {
      throw new Error('Not authenticated');
    }

    if (!workspaceId) {
      throw new Error('No workspace selected');
    }

    // Create FormData for upload
    const formData = new FormData();
    formData.append('file', {
      uri: item.uri,
      type: item.mimeType,
      name: item.filename,
    } as any);
    formData.append('gallery_id', item.galleryId);

    // Use FileSystem for upload with progress
    const uploadResult = await FileSystem.uploadAsync(
      `${UPLOAD_SERVICE_URL}/upload`,
      item.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'X-Workspace-ID': workspaceId,
        },
        parameters: {
          gallery_id: item.galleryId,
        },
      }
    );

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      item.status = 'completed';
      item.progress = 100;
      notifyComplete(item);
    } else {
      throw new Error(`Upload failed with status ${uploadResult.status}`);
    }
  } catch (error: any) {
    item.status = 'failed';
    item.error = error.message || 'Upload failed';
    notifyError(item);
  }

  // Remove from queue
  uploadQueue = uploadQueue.filter((i) => i.id !== item.id);
}

/**
 * Retry failed upload
 */
export async function retryUpload(itemId: string): Promise<void> {
  const item = uploadQueue.find((i) => i.id === itemId);
  if (item && item.status === 'failed') {
    item.status = 'pending';
    item.error = undefined;
    item.progress = 0;

    if (!isProcessing) {
      processQueue();
    }
  }
}

/**
 * Cancel upload
 */
export function cancelUpload(itemId: string): void {
  uploadQueue = uploadQueue.filter((i) => i.id !== itemId);
}

/**
 * Get current upload queue
 */
export function getUploadQueue(): UploadItem[] {
  return [...uploadQueue];
}

/**
 * Clear completed uploads from queue
 */
export function clearCompleted(): void {
  uploadQueue = uploadQueue.filter((i) => i.status !== 'completed');
}

// Callback management

function notifyProgress(item: UploadItem): void {
  const callback = onProgressCallbacks.get(item.id);
  if (callback) callback(item);
}

function notifyComplete(item: UploadItem): void {
  const callback = onCompleteCallbacks.get(item.id);
  if (callback) callback(item);
}

function notifyError(item: UploadItem): void {
  const callback = onErrorCallbacks.get(item.id);
  if (callback) callback(item);
}

/**
 * Subscribe to upload progress
 */
export function onUploadProgress(itemId: string, callback: UploadCallback): () => void {
  onProgressCallbacks.set(itemId, callback);
  return () => onProgressCallbacks.delete(itemId);
}

/**
 * Subscribe to upload complete
 */
export function onUploadComplete(itemId: string, callback: UploadCallback): () => void {
  onCompleteCallbacks.set(itemId, callback);
  return () => onCompleteCallbacks.delete(itemId);
}

/**
 * Subscribe to upload error
 */
export function onUploadError(itemId: string, callback: UploadCallback): () => void {
  onErrorCallbacks.set(itemId, callback);
  return () => onErrorCallbacks.delete(itemId);
}
