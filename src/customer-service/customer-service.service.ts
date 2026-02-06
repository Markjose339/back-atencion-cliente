import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { PaginationService } from '@/pagination/pagination.service';
import { TicketsService } from '@/tickets/tickets.service';
import { UsersService } from '@/users/users.service';
import { WebsocketGateway } from '@/websocket/websocket.gateway';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class CustomerServiceService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly websocketGateway: WebsocketGateway,
  ) {
    super();
  }

  async findPendingTicketsByUserServiceWindow(
    userId: string,
    paginationDto: PaginationDto,
  ) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) {
      throw new NotFoundException(`Usuario con el id ${userId} no encontrado`);
    }

    const ticketInProgress = await this.db.query.tickets.findFirst({
      where: and(
        eq(schema.tickets.userId, userId),
        isNull(schema.tickets.attentionFinishedAt),
      ),
      columns: {
        id: true,
      },
    });
    const where = ticketInProgress
      ? and(
          eq(schema.tickets.id, ticketInProgress.id),
          search
            ? or(
                ilike(schema.tickets.code, `%${search}%`),
                ilike(schema.tickets.packageCode, `%${search}%`),
              )
            : undefined,
        )
      : and(
          isNull(schema.tickets.userId),
          search
            ? or(
                ilike(schema.tickets.code, `%${search}%`),
                ilike(schema.tickets.packageCode, `%${search}%`),
              )
            : undefined,
        );

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.tickets.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          code: true,
          packageCode: true,
          type: true,
          attentionStartedAt: true,
          attentionFinishedAt: true,
          createdAt: true,
        },
        orderBy: (tickets, { asc }) => [
          sql`CASE WHEN ${tickets.type} = 'PREFERENCIAL' THEN 0 ELSE 1 END`,

          asc(tickets.createdAt),
        ],
      }),
      this.db.select({ value: count() }).from(schema.tickets).where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return {
      data,
      meta,
      isAttendingTicket: !!ticketInProgress,
    };
  }

  async startTicketAttention(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserEmail(userId),
    ]);

    const [ticket] = await this.db
      .update(schema.tickets)
      .set({
        userId,
        attentionStartedAt: new Date(),
      })
      .where(eq(schema.tickets.id, ticketId))
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
      });

    this.websocketGateway.server.to('tickets').emit('ticket:started');
    return {
      message: `Atención del ticket "${ticket.code}" iniciada correctamente`,
    };
  }

  async endTicketAttention(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserEmail(userId),
    ]);
    const [ticket] = await this.db
      .update(schema.tickets)
      .set({
        attentionFinishedAt: new Date(),
      })
      .where(eq(schema.tickets.id, ticketId))
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
      });

    return {
      message: `Atención del ticket "${ticket.code}" finalizada correctamente`,
    };
  }

  async getAttendingTickets() {
    const attendingTickets = await this.db.query.tickets.findMany({
      where: and(
        isNotNull(schema.tickets.attentionStartedAt),
        isNull(schema.tickets.attentionFinishedAt),
      ),
      columns: {
        id: true,
        code: true,
        attentionStartedAt: true,
      },
      orderBy: (tickets, { asc }) => asc(tickets.attentionStartedAt),
    });

    return attendingTickets.map((ticket) => ({
      id: ticket.id,
      code: ticket.code,
    }));
  }
}
