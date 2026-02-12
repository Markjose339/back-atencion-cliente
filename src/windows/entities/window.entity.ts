import {
  pgTable,
  varchar,
  timestamp,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { branchWindows } from '@/branches/entities/branch-windows.entity';

export const windows = pgTable(
  'windows',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    code: varchar('code', { length: 10 }).unique().notNull(),
    name: varchar('name', { length: 50 }).unique().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('windows_code_idx').on(t.code),
    index('windows_name_idx').on(t.name),
  ],
);

export const windowsRelations = relations(windows, ({ many }) => ({
  branchWindows: many(branchWindows),
}));
