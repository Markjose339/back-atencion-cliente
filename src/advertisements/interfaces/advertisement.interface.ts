import type {
  AdvertisementDisplayMode,
  AdvertisementMediaType,
  AdvertisementTransition,
} from '@/advertisements/constants/advertisement.constants';

export interface AdvertisementResponse {
  id: string;
  title: string;
  description: string | null;
  mediaType: AdvertisementMediaType;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  displayMode: AdvertisementDisplayMode;
  transition: AdvertisementTransition;
  durationSeconds: number;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  isVisibleNow: boolean;
  createdAt: Date;
  updatedAt: Date;
}
