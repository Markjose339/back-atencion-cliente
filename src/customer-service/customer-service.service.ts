import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { PaginationService } from '@/pagination/pagination.service';
import { PublicService } from '@/public/public.service';
import { TicketsService } from '@/tickets/tickets.service';
import { UsersService } from '@/users/users.service';
import { WebsocketGateway } from '@/websocket/websocket.gateway';
import {
  CustomerServiceCalledTicket,
  CustomerServiceQueueResponse,
} from './dto/operator-queue-response.dto';
import {
  type TicketDurationMetric,
  type TicketAttentionTimelineListItem,
  type TicketAttentionTimelineListResponse,
} from './dto/ticket-attention-timeline-response.dto';
import { AdminTicketTimelineQueryDto } from './dto/admin-ticket-timeline-query.dto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PublicDisplayTicket } from '@/public/interfaces/public.interface';

type TicketStatus =
  | 'PENDIENTE'
  | 'LLAMADO'
  | 'ATENDIENDO'
  | 'ESPERA'
  | 'FINALIZADO'
  | 'CANCELADO';

type TicketEventName =
  | 'ticket:called'
  | 'ticket:recalled'
  | 'ticket:started'
  | 'ticket:held'
  | 'ticket:finished'
  | 'ticket:cancelled';

type TicketAttentionTimelineListRow = {
  id: string;
  code: string;
  packageCode: string | null;
  type: 'REGULAR' | 'PREFERENCIAL';
  status: TicketStatus;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  userId: string | null;
  userName: string | null;
  calledAt: Date | null;
  attentionStartedAt: Date | null;
  attentionFinishedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class CustomerServiceService extends PaginationService {
  private readonly MAX_HELD_TICKETS = 3;

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

  private async countHeldTicketsByUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.tickets)
      .where(
        and(
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'ESPERA' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
        ),
      );

    return Number(row?.value ?? 0);
  }

  private async getHeldTicketsByUserBranch(userId: string, branchId: string) {
    return this.db
      .select({
        id: schema.tickets.id,
        code: schema.tickets.code,
        packageCode: schema.tickets.packageCode,
        type: schema.tickets.type,
        status: schema.tickets.status,
        branchId: schema.tickets.branchId,
        serviceId: schema.tickets.serviceId,
        serviceName: schema.services.name,
        calledAt: schema.tickets.calledAt,
        attentionStartedAt: schema.tickets.attentionStartedAt,
        attentionFinishedAt: schema.tickets.attentionFinishedAt,
        createdAt: schema.tickets.createdAt,
      })
      .from(schema.tickets)
      .innerJoin(
        schema.services,
        eq(schema.tickets.serviceId, schema.services.id),
      )
      .where(
        and(
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.branchId, branchId),
          eq(schema.tickets.status, 'ESPERA' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
        ),
      )
      .orderBy(
        sql`${schema.tickets.attentionStartedAt} ASC NULLS LAST`,
        schema.tickets.createdAt,
      );
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

    this.websocketGateway.emitDashboardInvalidation({
      event,
      ticketId: ticket.id,
      branchId: ticket.branchId,
      serviceId: ticket.serviceId,
    });
  }

  private buildDurationMetric(
    start: Date | null,
    end: Date | null,
  ): TicketDurationMetric | null {
    if (!start || !end) return null;

    const milliseconds = end.getTime() - start.getTime();
    if (milliseconds < 0) return null;

    return {
      milliseconds,
      seconds: Number((milliseconds / 1000).toFixed(2)),
      minutes: Number((milliseconds / 60000).toFixed(2)),
    };
  }

  private mapTicketAttentionTimelineListItem(
    row: TicketAttentionTimelineListRow,
  ): TicketAttentionTimelineListItem {
    return {
      id: row.id,
      code: row.code,
      packageCode: row.packageCode,
      type: row.type,
      status: row.status,
      branchId: row.branchId,
      branchName: row.branchName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      userId: row.userId,
      userName: row.userName,
      calledAt: row.calledAt,
      attentionStartedAt: row.attentionStartedAt,
      attentionFinishedAt: row.attentionFinishedAt,
      createdAt: row.createdAt,
      fromCreatedToAttention: this.buildDurationMetric(
        row.createdAt,
        row.attentionStartedAt,
      ),
      fromAttentionStartToFinish: this.buildDurationMetric(
        row.attentionStartedAt,
        row.attentionFinishedAt,
      ),
    };
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

    const [ticketInProgress, calledTicket, heldTickets] = await Promise.all([
      this.db.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
        ),
        columns: { id: true },
      }),
      this.getLatestCalledTicketByScope(userId, branchId, serviceId),
      this.getHeldTicketsByUserBranch(userId, branchId),
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
    return {
      data,
      heldTickets,
      meta,
      isAttendingTicket: !!ticketInProgress,
      calledTicket,
    };
  }

  async findTicketAttentionTimelines(
    query: AdminTicketTimelineQueryDto,
  ): Promise<TicketAttentionTimelineListResponse> {
    const { page, limit } = this.validatePaginationParams(query);
    const { search } = query;
    const skip = this.calulateSkip(page, limit);
    const branchId = query.branchId?.trim();

    const searchTerm = search?.trim();
    const searchFilter = searchTerm
      ? or(
          ilike(schema.tickets.code, `%${searchTerm}%`),
          ilike(schema.tickets.packageCode, `%${searchTerm}%`),
        )
      : undefined;

    const branchFilter = branchId
      ? eq(schema.tickets.branchId, branchId)
      : undefined;

    const where = and(branchFilter, searchFilter);

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: schema.tickets.id,
          code: schema.tickets.code,
          packageCode: schema.tickets.packageCode,
          type: schema.tickets.type,
          status: schema.tickets.status,
          branchId: schema.tickets.branchId,
          branchName: schema.branches.name,
          serviceId: schema.tickets.serviceId,
          serviceName: schema.services.name,
          userId: schema.tickets.userId,
          userName: schema.users.name,
          calledAt: schema.tickets.calledAt,
          attentionStartedAt: schema.tickets.attentionStartedAt,
          attentionFinishedAt: schema.tickets.attentionFinishedAt,
          createdAt: schema.tickets.createdAt,
        })
        .from(schema.tickets)
        .innerJoin(
          schema.branches,
          eq(schema.tickets.branchId, schema.branches.id),
        )
        .innerJoin(
          schema.services,
          eq(schema.tickets.serviceId, schema.services.id),
        )
        .leftJoin(schema.users, eq(schema.tickets.userId, schema.users.id))
        .where(where)
        .orderBy(desc(schema.tickets.createdAt))
        .limit(limit)
        .offset(skip),
      this.db.select({ value: count() }).from(schema.tickets).where(where),
    ]);

    const data = rows.map((row) =>
      this.mapTicketAttentionTimelineListItem(row),
    );
    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return { data, meta };
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

      if (!next) {
        throw new NotFoundException(
          'No hay tickets disponibles para tu servicio',
        );
      }

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

      if (!ticket) {
        throw new ConflictException(
          'Ese ticket ya ha sido llamado por otra ventanilla',
        );
      }

      return ticket;
    });

    const displayTicket = await this.getDisplayTicketOrThrow(called.id);
    this.emitTicketEvent('ticket:called', displayTicket);

    return called;
  }

  async holdTicket(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const heldCount = await this.countHeldTicketsByUser(userId);
    if (heldCount >= this.MAX_HELD_TICKETS) {
      throw new BadRequestException(
        'No puedes tener mas de 3 tickets en espera',
      );
    }

    const [held] = await this.db
      .update(schema.tickets)
      .set({
        status: 'ESPERA' as TicketStatus,
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

    if (!held) {
      throw new BadRequestException(
        'No se puede poner en espera: el ticket no esta ATENDIENDO por este usuario',
      );
    }

    const displayTicket = await this.getDisplayTicketOrThrow(held.id);
    this.emitTicketEvent('ticket:held', displayTicket);

    return {
      message: `Ticket "${held.code}" puesto en espera correctamente`,
    };
  }

  async recallTicket(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const ticket = await this.db.query.tickets.findFirst({
      where: and(
        eq(schema.tickets.id, ticketId),
        eq(schema.tickets.userId, userId),
      ),
      columns: {
        id: true,
        status: true,
        attentionStartedAt: true,
        attentionFinishedAt: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(
        'No se encontro el ticket para re-llamar por este usuario',
      );
    }

    const canRecallFromCalled = ticket.status === ('LLAMADO' as TicketStatus);
    const canRecallFromHeld =
      ticket.status === ('ESPERA' as TicketStatus) &&
      !!ticket.attentionStartedAt;

    if (!canRecallFromCalled && !canRecallFromHeld) {
      throw new BadRequestException(
        'No se puede re-llamar: el ticket no esta LLAMADO ni ESPERA por este usuario',
      );
    }

    if (canRecallFromHeld) {
      const calledByUser = await this.db.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'LLAMADO' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
          ne(schema.tickets.id, ticketId),
        ),
        columns: { id: true },
      });

      if (calledByUser) {
        throw new BadRequestException(
          'No puedes re-llamar un ticket en espera mientras tienes uno en estado LLAMADO',
        );
      }

      const attendingByUser = await this.db.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
          isNull(schema.tickets.attentionFinishedAt),
          ne(schema.tickets.id, ticketId),
        ),
        columns: { id: true },
      });

      if (attendingByUser) {
        throw new BadRequestException(
          'No puedes re-llamar un ticket en espera mientras tienes uno en ATENDIENDO',
        );
      }
    }

    const [recalled] = await this.db
      .update(schema.tickets)
      .set({
        status: 'LLAMADO' as TicketStatus,
        calledAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.tickets.id, ticketId),
          eq(schema.tickets.userId, userId),
          eq(schema.tickets.status, ticket.status),
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
      throw new ConflictException(
        'No se pudo re-llamar: el ticket cambio de estado, intenta nuevamente',
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

    const started = await this.db.transaction(async (tx) => {
      // Lock all operator tickets to avoid concurrent conflicting transitions.
      await tx.execute(
        sql`SELECT ${schema.tickets.id} FROM ${schema.tickets} WHERE ${schema.tickets.userId} = ${userId} FOR UPDATE`,
      );

      const ticket = await tx.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.id, ticketId),
          eq(schema.tickets.userId, userId),
        ),
        columns: {
          id: true,
          status: true,
          attentionStartedAt: true,
          attentionFinishedAt: true,
        },
      });

      if (!ticket) {
        throw new NotFoundException(
          'No se puede iniciar: ticket no pertenece al usuario',
        );
      }

      const canStartFromCalled = ticket.status === ('LLAMADO' as TicketStatus);
      const canStartFromHeld = ticket.status === ('ESPERA' as TicketStatus);

      if (
        (!canStartFromCalled && !canStartFromHeld) ||
        ticket.attentionFinishedAt
      ) {
        throw new NotFoundException(
          'No se puede iniciar: ticket no esta LLAMADO/ESPERA o ya finalizo',
        );
      }

      if (canStartFromHeld) {
        const calledConflict = await tx.query.tickets.findFirst({
          where: and(
            eq(schema.tickets.userId, userId),
            eq(schema.tickets.status, 'LLAMADO' as TicketStatus),
            isNull(schema.tickets.attentionFinishedAt),
            ne(schema.tickets.id, ticketId),
          ),
          columns: { id: true },
        });

        if (calledConflict) {
          throw new BadRequestException(
            'No puedes reanudar un ticket en espera mientras tienes uno en estado LLAMADO',
          );
        }

        const attendingConflict = await tx.query.tickets.findFirst({
          where: and(
            eq(schema.tickets.userId, userId),
            eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
            isNull(schema.tickets.attentionFinishedAt),
            ne(schema.tickets.id, ticketId),
          ),
          columns: { id: true },
        });

        if (attendingConflict) {
          throw new BadRequestException(
            'No puedes reanudar un ticket en espera mientras tienes uno en ATENDIENDO',
          );
        }
      }

      const [updated] = ticket.attentionStartedAt
        ? await tx
            .update(schema.tickets)
            .set({
              status: 'ATENDIENDO' as TicketStatus,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(schema.tickets.id, ticketId),
                eq(schema.tickets.userId, userId),
                eq(schema.tickets.status, ticket.status),
                isNull(schema.tickets.attentionFinishedAt),
              ),
            )
            .returning({
              id: schema.tickets.id,
              code: schema.tickets.code,
            })
        : await tx
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
                eq(schema.tickets.status, ticket.status),
                isNull(schema.tickets.attentionFinishedAt),
              ),
            )
            .returning({
              id: schema.tickets.id,
              code: schema.tickets.code,
            });

      if (!updated) {
        throw new ConflictException(
          'No se puede iniciar: el ticket cambio de estado, intenta nuevamente',
        );
      }

      return updated;
    });

    if (!started) {
      throw new ConflictException(
        'No se puede iniciar: el ticket cambio de estado, intenta nuevamente',
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
            eq(schema.tickets.status, 'ESPERA' as TicketStatus),
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
