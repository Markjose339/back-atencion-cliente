import { tickets } from '@/tickets/entities/ticket.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const ticketRatings = pgTable(
  'ticket_ratings',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),

    ticketId: varchar('ticket_id', { length: 24 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),

    score: integer('score').notNull(),

    ratedAt: timestamp('rated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('ticket_ratings_ticket_id_uq').on(t.ticketId),
    index('ticket_ratings_rated_at_idx').on(t.ratedAt),
    check('ticket_ratings_score_check', sql`${t.score} BETWEEN 1 AND 5`),
  ],
);

export const ticketRatingsRelations = relations(ticketRatings, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketRatings.ticketId],
    references: [tickets.id],
  }),
}));
