import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { PaginationService } from '@/pagination/pagination.service';
import { TicketsService } from '@/tickets/tickets.service';
import { UsersService } from '@/users/users.service';
import { WebsocketGateway } from '@/websocket/websocket.gateway';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, ilike, isNull, or, sql } from 'drizzle-orm';
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

  private async getUserWindowByBranch(userId: string, branchId: string) {
    const rows = await this.db
      .select({ windowId: schema.branchWindowServices.windowId })
      .from(schema.branchWindowServices)
      .where(
        and(
          eq(schema.branchWindowServices.userId, userId),
          eq(schema.branchWindowServices.branchId, branchId),
        ),
      );

    const unique = Array.from(
      new Set(rows.map((r) => r.windowId).filter(Boolean)),
    );

    if (unique.length === 0) {
      throw new NotFoundException(
        'No tienes una ventanilla asignada en esta sucursal',
      );
    }

    if (unique.length > 1) {
      throw new NotFoundException(
        'Tu usuario tiene más de una ventanilla asignada en esta sucursal',
      );
    }

    return unique[0] as string;
  }

  async findPendingTicketsByUserServiceWindow(userId: string, paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    await this.usersService.validatedUserId(userId);

    const ticketInProgress = await this.db.query.tickets.findFirst({
      where: and(eq(schema.tickets.userId, userId), isNull(schema.tickets.attentionFinishedAt)),
      columns: { id: true },
    });

    const searchFilter = search
      ? or(
          ilike(schema.tickets.code, `%${search}%`),
          ilike(schema.tickets.packageCode, `%${search}%`),
        )
      : undefined;

    const where = ticketInProgress
      ? and(eq(schema.tickets.id, ticketInProgress.id), searchFilter)
      : and(
          isNull(schema.tickets.userId),
          isNull(schema.tickets.attentionStartedAt),
          isNull(schema.tickets.attentionFinishedAt),
          sql`exists (
            select 1
            from ${schema.branchWindowServices} bws
            where bws.user_id = ${userId}
              and bws.branch_id = ${schema.tickets.branchId}
              and bws.service_id = ${schema.tickets.serviceId}
          )`,
          searchFilter,
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
          branchId: true,
          windowId: true,
          serviceId: true,
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

    return { data, meta, isAttendingTicket: !!ticketInProgress };
  }

  async startTicketAttention(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const ticketQueue = await this.db.query.tickets.findFirst({
      where: eq(schema.tickets.id, ticketId),
      columns: {
        id: true,
        code: true,
        branchId: true,
        serviceId: true,
      },
    });

    if (!ticketQueue) {
      throw new NotFoundException(`Ticket con el id ${ticketId} no encontrado`);
    }

    const windowId = await this.getUserWindowByBranch(userId, ticketQueue.branchId);

    const allowed = await this.db.query.branchWindowServices.findFirst({
      where: and(
        eq(schema.branchWindowServices.userId, userId),
        eq(schema.branchWindowServices.branchId, ticketQueue.branchId),
        eq(schema.branchWindowServices.windowId, windowId),
        eq(schema.branchWindowServices.serviceId, ticketQueue.serviceId),
      ),
      columns: { id: true },
    });

    if (!allowed) {
      throw new NotFoundException('No estás asignado a este servicio en tu ventanilla');
    }

    const [taken] = await this.db
      .update(schema.tickets)
      .set({
        userId,
        windowId,
        attentionStartedAt: new Date(),
      })
      .where(
        and(
          eq(schema.tickets.id, ticketId),
          isNull(schema.tickets.userId),
          isNull(schema.tickets.attentionStartedAt),
        ),
      )
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
        branchId: schema.tickets.branchId,
        windowId: schema.tickets.windowId,
        serviceId: schema.tickets.serviceId,
      });

    if (!taken) {
      throw new NotFoundException('Este ticket ya fue tomado por otro operador');
    }

    const privateRoom = `queue:${taken.branchId}:${taken.serviceId}`;
    const publicRoom = `public:queue:${taken.branchId}:${taken.serviceId}`;

    this.websocketGateway.server.to(privateRoom).emit('ticket:started', {
      id: taken.id,
      code: taken.code,
      userId,
      windowId: taken.windowId,
    });

    this.websocketGateway.server.to(publicRoom).emit('ticket:started', {
      id: taken.id,
      code: taken.code,
    });

    return { message: `Atención del ticket "${taken.code}" iniciada correctamente` };
  }

  async endTicketAttention(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const [ticket] = await this.db
      .update(schema.tickets)
      .set({ attentionFinishedAt: new Date() })
      .where(
        and(
          eq(schema.tickets.id, ticketId),
          eq(schema.tickets.userId, userId),
          isNull(schema.tickets.attentionFinishedAt),
        ),
      )
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
        branchId: schema.tickets.branchId,
        windowId: schema.tickets.windowId,
        serviceId: schema.tickets.serviceId,
      });

    if (!ticket) {
      throw new NotFoundException('No se pudo finalizar: no está en atención por este usuario');
    }

    const privateRoom = `queue:${ticket.branchId}:${ticket.serviceId}`;
    const publicRoom = `public:queue:${ticket.branchId}:${ticket.serviceId}`;

    this.websocketGateway.server.to(privateRoom).emit('ticket:finished', {
      id: ticket.id,
      code: ticket.code,
      userId,
      windowId: ticket.windowId,
    });

    this.websocketGateway.server.to(publicRoom).emit('ticket:finished', {
      id: ticket.id,
      code: ticket.code,
    });

    return { message: `Atención del ticket "${ticket.code}" finalizada correctamente` };
  }
}
