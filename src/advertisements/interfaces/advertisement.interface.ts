import type {
  AdvertisementDisplayMode,
  AdvertisementMediaType,
} from '@/advertisements/constants/advertisement.constants';

export interface AdvertisementResponse {
  id: string;
  title: string;
  mediaType: AdvertisementMediaType;
  filePath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  textContent: string | null;
  displayMode: AdvertisementDisplayMode;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  isVisibleNow: boolean;
  createdAt: Date;
  updatedAt: Date;
}
