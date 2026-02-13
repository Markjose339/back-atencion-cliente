import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { PaginationService } from '@/pagination/pagination.service';
import { PublicDisplayTicket, PublicService } from '@/public/public.service';
import { TicketsService } from '@/tickets/tickets.service';
import { UsersService } from '@/users/users.service';
import { WebsocketGateway } from '@/websocket/websocket.gateway';
import {
  CustomerServiceCalledTicket,
  CustomerServiceQueueResponse,
} from './dto/operator-queue-response.dto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

type TicketStatus =
  | 'PENDIENTE'
  | 'LLAMADO'
  | 'ATENDIENDO'
  | 'FINALIZADO'
  | 'CANCELADO';

type TicketEventName =
  | 'ticket:called'
  | 'ticket:recalled'
  | 'ticket:started'
  | 'ticket:finished'
  | 'ticket:cancelled';

@Injectable()
export class CustomerServiceService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly publicService: PublicService,
  ) {
    super();
  }

  private async getUserBranchWindowByBranch(userId: string, branchId: string) {
    const row = await this.db.query.userBranchWindows.findFirst({
      where: and(
        eq(schema.userBranchWindows.userId, userId),
        eq(schema.userBranchWindows.branchId, branchId),
        eq(schema.userBranchWindows.isActive, true),
      ),
      columns: { branchWindowId: true },
    });

    if (!row?.branchWindowId) {
      throw new NotFoundException(
        'No tienes una ventanilla asignada en esta sucursal',
      );
    }

    return row.branchWindowId;
  }

  private async getBranchWindowServiceIdOrThrow(
    branchWindowId: string,
    serviceId: string,
  ) {
    const bws = await this.db.query.branchWindowServices.findFirst({
      where: and(
        eq(schema.branchWindowServices.branchWindowId, branchWindowId),
        eq(schema.branchWindowServices.serviceId, serviceId),
        eq(schema.branchWindowServices.isActive, true),
      ),
      columns: { id: true },
    });

    if (!bws) {
      throw new NotFoundException(
        'Este servicio no esta habilitado en tu ventanilla',
      );
    }

    return bws.id;
  }

  private async getLatestCalledTicketByScope(
    userId: string,
    branchId: string,
    serviceId: string,
  ): Promise<CustomerServiceCalledTicket | null> {
    const calledTicket = await this.db.query.tickets.findFirst({
      where: and(
        eq(schema.tickets.userId, userId),
        eq(schema.tickets.branchId, branchId),
        eq(schema.tickets.serviceId, serviceId),
        eq(schema.tickets.status, 'LLAMADO' as TicketStatus),
      ),
      columns: {
        id: true,
        code: true,
        type: true,
        status: true,
        branchId: true,
        serviceId: true,
        userId: true,
        branchWindowServiceId: true,
        calledAt: true,
        createdAt: true,
      },
      orderBy: (t, { desc }) => [
        sql`${t.calledAt} DESC NULLS LAST`,
        desc(t.createdAt),
      ],
    });

    if (!calledTicket) return null;

    return { ...calledTicket, status: 'LLAMADO' };
  }

  private async getDisplayTicketOrThrow(ticketId: string) {
    const ticket = await this.publicService.getDisplayTicketById(ticketId);
    if (!ticket) {
      throw new NotFoundException(
        'No se encontro el ticket para emitir el evento en tiempo real',
      );
    }

    return ticket;
  }

  private emitTicketEvent(
    event: TicketEventName,
    ticket: PublicDisplayTicket,
    emitUpdated = true,
  ) {
    const privateRoom = this.websocketGateway.getQueueRoom(
      ticket.branchId,
      ticket.serviceId,
    );
    const publicRoom = this.websocketGateway.getPublicRoom(
      ticket.branchId,
      ticket.serviceId,
    );

    this.websocketGateway.server.to(privateRoom).emit(event, ticket);
    this.websocketGateway.server.to(publicRoom).emit(event, ticket);

    if (!emitUpdated) return;

    this.websocketGateway.server.to(privateRoom).emit('ticket:updated', ticket);
    this.websocketGateway.server.to(publicRoom).emit('ticket:updated', ticket);
  }

  async findPendingTicketsByUserServiceWindow(
    userId: string,
    branchId: string,
    serviceId: string,
    paginationDto: PaginationDto,
  ): Promise<CustomerServiceQueueResponse> {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    await this.usersService.validatedUserId(userId);

    const branchWindowId = await this.getUserBranchWindowByBranch(
      userId,
      branchId,
    );
    await this.getBranchWindowServiceIdOrThrow(branchWindowId, serviceId);

    const [ticketInProgress, calledTicket] = await Promise.all([
      this.db.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
        ),
        columns: { id: true },
      }),
      this.getLatestCalledTicketByScope(userId, branchId, serviceId),
    ]);

    const searchFilter = search
      ? or(
          ilike(schema.tickets.code, `%${search}%`),
          ilike(schema.tickets.packageCode, `%${search}%`),
        )
      : undefined;

    const where = ticketInProgress
      ? and(eq(schema.tickets.id, ticketInProgress.id), searchFilter)
      : and(
          eq(schema.tickets.branchId, branchId),
          eq(schema.tickets.serviceId, serviceId),
          eq(schema.tickets.status, 'PENDIENTE' as TicketStatus),
          isNull(schema.tickets.userId),
          isNull(schema.tickets.branchWindowServiceId),
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
          status: true,
          branchId: true,
          serviceId: true,
          calledAt: true,
          attentionStartedAt: true,
          attentionFinishedAt: true,
          createdAt: true,
        },
        orderBy: (t, { asc }) => [
          sql`CASE WHEN ${t.type} = 'PREFERENCIAL' THEN 0 ELSE 1 END`,
          asc(t.createdAt),
        ],
      }),
      this.db.select({ value: count() }).from(schema.tickets).where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);
    return { data, meta, isAttendingTicket: !!ticketInProgress, calledTicket };
  }

  async callNextTicket(branchId: string, serviceId: string, userId: string) {
    await this.usersService.validatedUserId(userId);

    const called = await this.db.transaction(async (tx) => {
      const inProgress = await tx.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
        ),
        columns: { id: true },
      });

      if (inProgress) {
        throw new BadRequestException(
          'No puedes llamar otro ticket mientras estas ATENDIENDO uno',
        );
      }

      const branchWindow = await tx.query.userBranchWindows.findFirst({
        where: and(
          eq(schema.userBranchWindows.userId, userId),
          eq(schema.userBranchWindows.branchId, branchId),
          eq(schema.userBranchWindows.isActive, true),
        ),
        columns: { branchWindowId: true },
      });

      if (!branchWindow?.branchWindowId) {
        throw new NotFoundException(
          'No tienes una ventanilla asignada en esta sucursal',
        );
      }

      const bws = await tx.query.branchWindowServices.findFirst({
        where: and(
          eq(
            schema.branchWindowServices.branchWindowId,
            branchWindow.branchWindowId,
          ),
          eq(schema.branchWindowServices.serviceId, serviceId),
          eq(schema.branchWindowServices.isActive, true),
        ),
        columns: { id: true },
      });

      if (!bws) {
        throw new NotFoundException(
          'Este servicio no esta habilitado en tu ventanilla',
        );
      }

      const next = await tx.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.branchId, branchId),
          eq(schema.tickets.serviceId, serviceId),
          eq(schema.tickets.status, 'PENDIENTE' as TicketStatus),
          isNull(schema.tickets.userId),
          isNull(schema.tickets.branchWindowServiceId),
        ),
        orderBy: (t, { asc }) => [
          sql`CASE WHEN ${t.type} = 'PREFERENCIAL' THEN 0 ELSE 1 END`,
          asc(t.createdAt),
        ],
        columns: { id: true },
      });

      if (!next) return null;

      const [ticket] = await tx
        .update(schema.tickets)
        .set({
          status: 'LLAMADO' as TicketStatus,
          calledAt: sql`now()`,
          updatedAt: sql`now()`,
          userId,
          branchWindowServiceId: bws.id,
        })
        .where(
          and(
            eq(schema.tickets.id, next.id),
            eq(schema.tickets.status, 'PENDIENTE' as TicketStatus),
            isNull(schema.tickets.userId),
            isNull(schema.tickets.branchWindowServiceId),
          ),
        )
        .returning({
          id: schema.tickets.id,
          code: schema.tickets.code,
          type: schema.tickets.type,
          status: schema.tickets.status,
          branchId: schema.tickets.branchId,
          serviceId: schema.tickets.serviceId,
          userId: schema.tickets.userId,
          branchWindowServiceId: schema.tickets.branchWindowServiceId,
          calledAt: schema.tickets.calledAt,
          createdAt: schema.tickets.createdAt,
        });

      return ticket ?? null;
    });

    if (!called) return null;

    const displayTicket = await this.getDisplayTicketOrThrow(called.id);
    this.emitTicketEvent('ticket:called', displayTicket);

    return called;
  }

  async recallTicket(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const [recalled] = await this.db
      .update(schema.tickets)
      .set({
        calledAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.tickets.id, ticketId),
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'LLAMADO' as TicketStatus),
          isNull(schema.tickets.attentionStartedAt),
          isNull(schema.tickets.attentionFinishedAt),
        ),
      )
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
        type: schema.tickets.type,
        status: schema.tickets.status,
        branchId: schema.tickets.branchId,
        serviceId: schema.tickets.serviceId,
        userId: schema.tickets.userId,
        branchWindowServiceId: schema.tickets.branchWindowServiceId,
        calledAt: schema.tickets.calledAt,
        createdAt: schema.tickets.createdAt,
      });

    if (!recalled) {
      throw new BadRequestException(
        'No se puede re-llamar: el ticket no esta LLAMADO por este usuario',
      );
    }

    const displayTicket = await this.getDisplayTicketOrThrow(recalled.id);
    this.emitTicketEvent('ticket:called', displayTicket, false);
    this.emitTicketEvent('ticket:recalled', displayTicket);

    return {
      message: `Ticket "${recalled.code}" re-llamado correctamente`,
      ticket: recalled,
    };
  }

  async startTicketAttention(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const inProgress = await this.db.query.tickets.findFirst({
      where: and(
        eq(schema.tickets.userId, userId),
        eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
        isNull(schema.tickets.attentionFinishedAt),
      ),
      columns: { id: true },
    });

    if (inProgress && inProgress.id !== ticketId) {
      throw new BadRequestException('Ya estas ATENDIENDO un ticket');
    }

    const [started] = await this.db
      .update(schema.tickets)
      .set({
        status: 'ATENDIENDO' as TicketStatus,
        attentionStartedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.tickets.id, ticketId),
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'LLAMADO' as TicketStatus),
          isNull(schema.tickets.attentionStartedAt),
        ),
      )
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
      });

    if (!started) {
      throw new NotFoundException(
        'No se puede iniciar: ticket no esta LLAMADO o no pertenece al usuario',
      );
    }

    const displayTicket = await this.getDisplayTicketOrThrow(started.id);
    this.emitTicketEvent('ticket:started', displayTicket);

    return {
      message: `Atencion del ticket "${started.code}" iniciada correctamente`,
    };
  }

  async finishTicketAttention(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const [finished] = await this.db
      .update(schema.tickets)
      .set({
        status: 'FINALIZADO' as TicketStatus,
        attentionFinishedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.tickets.id, ticketId),
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
        ),
      )
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
      });

    if (!finished) {
      throw new NotFoundException(
        'No se pudo finalizar: no esta ATENDIENDO por este usuario',
      );
    }

    const displayTicket = await this.getDisplayTicketOrThrow(finished.id);
    this.emitTicketEvent('ticket:finished', displayTicket);

    return {
      message: `Atencion del ticket "${finished.code}" finalizada correctamente`,
    };
  }

  async cancelTicket(ticketId: string, userId?: string) {
    await this.ticketsService.validatedTicketId(ticketId);

    const userCondition = userId
      ? or(isNull(schema.tickets.userId), eq(schema.tickets.userId, userId))
      : sql`true`;

    const [cancelled] = await this.db
      .update(schema.tickets)
      .set({
        status: 'CANCELADO' as TicketStatus,
        cancelledAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.tickets.id, ticketId),
          userCondition,
          or(
            eq(schema.tickets.status, 'PENDIENTE' as TicketStatus),
            eq(schema.tickets.status, 'LLAMADO' as TicketStatus),
          ),
        ),
      )
      .returning({
        id: schema.tickets.id,
        code: schema.tickets.code,
      });

    if (!cancelled) {
      throw new BadRequestException(
        'No se puede cancelar: el ticket ya esta en atencion o finalizado',
      );
    }

    const displayTicket = await this.getDisplayTicketOrThrow(cancelled.id);
    this.emitTicketEvent('ticket:cancelled', displayTicket);

    return { message: `Ticket "${cancelled.code}" cancelado` };
  }
}
