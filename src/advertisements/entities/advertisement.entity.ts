import { createId } from '@paralleldrive/cuid2';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core';
import {
  ADVERTISEMENT_DISPLAY_MODES,
  ADVERTISEMENT_MEDIA_TYPES,
  ADVERTISEMENT_TRANSITIONS,
} from '@/advertisements/constants/advertisement.constants';

export const AdvertisementMediaTypeEnum = pgEnum('advertisement_media_type', [
  ...ADVERTISEMENT_MEDIA_TYPES,
]);

export const AdvertisementDisplayModeEnum = pgEnum(
  'advertisement_display_mode',
  [...ADVERTISEMENT_DISPLAY_MODES],
);

export const AdvertisementTransitionEnum = pgEnum('advertisement_transition', [
  ...ADVERTISEMENT_TRANSITIONS,
]);

export const advertisements = pgTable(
  'advertisements',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    title: varchar('title', { length: 120 }).notNull(),
    description: varchar('description', { length: 300 }),

    mediaType: AdvertisementMediaTypeEnum('media_type').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    filePath: varchar('file_path', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    fileSize: integer('file_size').notNull(),

    displayMode: AdvertisementDisplayModeEnum('display_mode')
      .default('FULLSCREEN')
      .notNull(),
    transition: AdvertisementTransitionEnum('transition')
      .default('NONE')
      .notNull(),
    durationSeconds: integer('duration_seconds').default(10).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('advertisements_title_idx').on(t.title),
    index('advertisements_media_type_idx').on(t.mediaType),
    index('advertisements_display_mode_idx').on(t.displayMode),
    index('advertisements_is_active_idx').on(t.isActive),
    index('advertisements_sort_order_idx').on(t.sortOrder),
    index('advertisements_starts_at_idx').on(t.startsAt),
    index('advertisements_ends_at_idx').on(t.endsAt),
  ],
);
