export const ADVERTISEMENT_MEDIA_TYPES = ['IMAGE', 'VIDEO'] as const;
export type AdvertisementMediaType = (typeof ADVERTISEMENT_MEDIA_TYPES)[number];

export const ADVERTISEMENT_DISPLAY_MODES = [
  'FULLSCREEN',
  'BANNER_TOP',
  'BANNER_BOTTOM',
  'SPLIT_LEFT',
  'SPLIT_RIGHT',
] as const;
export type AdvertisementDisplayMode =
  (typeof ADVERTISEMENT_DISPLAY_MODES)[number];

export const ADVERTISEMENT_TRANSITIONS = ['NONE', 'FADE', 'SLIDE'] as const;
export type AdvertisementTransition =
  (typeof ADVERTISEMENT_TRANSITIONS)[number];

export const ADVERTISEMENT_DEFAULT_DISPLAY_MODE: AdvertisementDisplayMode =
  'FULLSCREEN';
export const ADVERTISEMENT_DEFAULT_TRANSITION: AdvertisementTransition = 'NONE';
export const ADVERTISEMENT_DEFAULT_DURATION_SECONDS = 10;

export const ADVERTISEMENT_UPLOAD_FIELD = 'file';
export const ADVERTISEMENT_UPLOAD_SUBDIRECTORY = 'advertisements';
export const ADVERTISEMENT_MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB
export const ADVERTISEMENT_UPLOAD_REQUEST_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2h

export const ADVERTISEMENT_ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const ADVERTISEMENT_ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
] as const;

export const ADVERTISEMENT_ALLOWED_UPLOAD_MIME_TYPES = [
  ...ADVERTISEMENT_ALLOWED_IMAGE_MIME_TYPES,
  ...ADVERTISEMENT_ALLOWED_VIDEO_MIME_TYPES,
] as const;
