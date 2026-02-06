import { createId } from '@paralleldrive/cuid2';
import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const services = pgTable(
  'services',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),

    name: varchar('name', { length: 50 }).unique().notNull(),
    abbreviation: varchar('abbreviation', { length: 10 }).notNull(),
    code: varchar('code', { length: 5 }).unique().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('services_name_idx').on(t.name),
    index('services_abbreviation_idx').on(t.abbreviation),
    index('services_code_idx').on(t.code),
  ],
);
