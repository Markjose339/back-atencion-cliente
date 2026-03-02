import type {
  AdvertisementDisplayMode,
  AdvertisementMediaType,
} from '@/advertisements/constants/advertisement.constants';

export interface AdvertisementResponse {
  id: string;
  title: string;
  mediaType: AdvertisementMediaType;
  displayMode: AdvertisementDisplayMode;

  // Media (IMAGE / VIDEO)
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;

  // Texto (TICKER)
  textContent: string | null;

  // Control
  isActive: boolean;
  isVisibleNow: boolean;
  startsAt: Date | null;
  endsAt: Date | null;

  // Auditoría
  createdAt: Date;
  updatedAt: Date;
}
