import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { userRoles } from './user-roles.entity';
import { tickets } from '@/tickets/entities/ticket.entity';
import { userBranchWindows } from './user-branch-windows.entity';

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    name: varchar('name', { length: 100 }).notNull(),
    email: varchar('email', { length: 100 }).unique().notNull(),
    password: varchar('password', { length: 100 }).notNull(),
    address: varchar('address', { length: 255 }),
    phone: varchar('phone', { length: 15 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('users_email_idx').on(t.email),
    index('users_is_active_idx').on(t.isActive),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  tickets: many(tickets),
  userBranchWindows: many(userBranchWindows),
}));
