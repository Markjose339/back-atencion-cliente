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
} from '@/advertisements/constants/advertisement.constants';

export const AdvertisementMediaTypeEnum = pgEnum('advertisement_media_type', [
  ...ADVERTISEMENT_MEDIA_TYPES,
]);

export const AdvertisementDisplayModeEnum = pgEnum(
  'advertisement_display_mode',
  [...ADVERTISEMENT_DISPLAY_MODES],
);

export const advertisements = pgTable(
  'advertisements',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    title: varchar('title', { length: 120 }).notNull(),
    displayMode: AdvertisementDisplayModeEnum('display_mode')
      .default('FULLSCREEN')
      .notNull(),
    mediaType: AdvertisementMediaTypeEnum('media_type').notNull(),

    filePath: varchar('file_path', { length: 255 }),
    mimeType: varchar('mime_type', { length: 120 }),
    fileSize: integer('file_size'),

    textContent: varchar('text_content', { length: 500 }),

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
    index('advertisements_active_schedule_idx').on(
      t.isActive,
      t.startsAt,
      t.endsAt,
    ),
    index('advertisements_display_mode_idx').on(t.displayMode),
  ],
);
