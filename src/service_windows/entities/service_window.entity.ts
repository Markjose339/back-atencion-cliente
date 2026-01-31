import { tickets } from '@/tickets/entities/ticket.entity';
import { users } from '@/users/entities/user.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const serviceWindows = pgTable(
  'service_windows',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    name: varchar('name', { length: 100 }).unique().notNull(),
    code: varchar('code', { length: 10 }).unique().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('service_windows_name_idx').on(t.name),
    index('service_windows_code_idx').on(t.code),
  ],
);

export const serviceWindowRelations = relations(serviceWindows, ({ many }) => ({
  tickets: many(tickets),
  users: many(users),
}));
