import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { PaginationService } from '@/pagination/pagination.service';
import { TicketsService } from '@/tickets/tickets.service';
import { UsersService } from '@/users/users.service';
import { WebsocketGateway } from '@/websocket/websocket.gateway';
import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, count, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

type TicketStatus =
  | 'PENDIENTE'
  | 'LLAMADO'
  | 'ATENDIENDO'
  | 'FINALIZADO'
  | 'CANCELADO';

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
        'Este servicio no está habilitado en tu ventanilla',
      );
    }

    return bws.id;
  }

  async findPendingTicketsByUserServiceWindow(
    userId: string,
    branchId: string,
    serviceId: string,
    paginationDto: PaginationDto,
  ) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    await this.usersService.validatedUserId(userId);

    const branchWindowId = await this.getUserBranchWindowByBranch(
      userId,
      branchId,
    );
    await this.getBranchWindowServiceIdOrThrow(branchWindowId, serviceId);

    const ticketInProgress = await this.db.query.tickets.findFirst({
      where: and(
        eq(schema.tickets.userId, userId),
        eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
        isNull(schema.tickets.attentionFinishedAt),
      ),
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
    return { data, meta, isAttendingTicket: !!ticketInProgress };
  }

  async callNextTicket(branchId: string, serviceId: string, userId: string) {
    await this.usersService.validatedUserId(userId);

    return this.db.transaction(async (tx) => {
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
          'No puedes llamar otro ticket mientras estás ATENDIENDO uno',
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

      const branchWindowId = branchWindow.branchWindowId;

      const bws = await tx.query.branchWindowServices.findFirst({
        where: and(
          eq(schema.branchWindowServices.branchWindowId, branchWindowId),
          eq(schema.branchWindowServices.serviceId, serviceId),
          eq(schema.branchWindowServices.isActive, true),
        ),
        columns: { id: true },
      });

      if (!bws) {
        throw new NotFoundException(
          'Este servicio no está habilitado en tu ventanilla',
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

      const [called] = await tx
        .update(schema.tickets)
        .set({
          status: 'LLAMADO' as TicketStatus,
          calledAt: new Date(),
          userId,
          branchWindowServiceId: bws.id,
          updatedAt: new Date(),
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

      if (!called) return null;

      // WebSocket: operador + público
      const privateRoom = `queue:${branchId}:${serviceId}`;
      const publicRoom = `public:queue:${branchId}:${serviceId}`;

      this.websocketGateway.server
        .to(privateRoom)
        .emit('ticket:called', called);
      this.websocketGateway.server.to(publicRoom).emit('ticket:called', {
        id: called.id,
        code: called.code,
        type: called.type,
        calledAt: called.calledAt,
      });

      return called;
    });
  }

  async recallTicket(ticketId: string, userId: string) {
    await Promise.all([
      this.ticketsService.validatedTicketId(ticketId),
      this.usersService.validatedUserId(userId),
    ]);

    const [recalled] = await this.db
      .update(schema.tickets)
      .set({
        calledAt: new Date(),
        updatedAt: new Date(),
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

    const privateRoom = `queue:${recalled.branchId}:${recalled.serviceId}`;
    const publicRoom = `public:queue:${recalled.branchId}:${recalled.serviceId}`;

    this.websocketGateway.server
      .to(privateRoom)
      .emit('ticket:called', recalled);
    this.websocketGateway.server.to(publicRoom).emit('ticket:called', {
      id: recalled.id,
      code: recalled.code,
      type: recalled.type,
      calledAt: recalled.calledAt,
    });

    this.websocketGateway.server
      .to(privateRoom)
      .emit('ticket:recalled', recalled);
    this.websocketGateway.server.to(publicRoom).emit('ticket:recalled', {
      id: recalled.id,
      code: recalled.code,
      type: recalled.type,
      calledAt: recalled.calledAt,
    });

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

    // Regla banco: si ya atiende uno, no puede iniciar otro
    const inProgress = await this.db.query.tickets.findFirst({
      where: and(
        eq(schema.tickets.userId, userId),
        eq(schema.tickets.status, 'ATENDIENDO' as TicketStatus),
        isNull(schema.tickets.attentionFinishedAt),
      ),
      columns: { id: true },
    });

    if (inProgress && inProgress.id !== ticketId) {
      throw new BadRequestException('Ya estás ATENDIENDO un ticket');
    }

    const [started] = await this.db
      .update(schema.tickets)
      .set({
        status: 'ATENDIENDO' as TicketStatus,
        attentionStartedAt: new Date(),
        updatedAt: new Date(),
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
        branchId: schema.tickets.branchId,
        serviceId: schema.tickets.serviceId,
        userId: schema.tickets.userId,
        branchWindowServiceId: schema.tickets.branchWindowServiceId,
        attentionStartedAt: schema.tickets.attentionStartedAt,
      });

    if (!started) {
      throw new NotFoundException(
        'No se puede iniciar: ticket no está LLAMADO o no pertenece al usuario',
      );
    }

    const privateRoom = `queue:${started.branchId}:${started.serviceId}`;
    const publicRoom = `public:queue:${started.branchId}:${started.serviceId}`;

    this.websocketGateway.server
      .to(privateRoom)
      .emit('ticket:started', started);
    this.websocketGateway.server.to(publicRoom).emit('ticket:started', {
      id: started.id,
      code: started.code,
    });

    return {
      message: `Atención del ticket "${started.code}" iniciada correctamente`,
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
        attentionFinishedAt: new Date(),
        updatedAt: new Date(),
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
        branchId: schema.tickets.branchId,
        serviceId: schema.tickets.serviceId,
        userId: schema.tickets.userId,
        branchWindowServiceId: schema.tickets.branchWindowServiceId,
        attentionFinishedAt: schema.tickets.attentionFinishedAt,
      });

    if (!finished) {
      throw new NotFoundException(
        'No se pudo finalizar: no está ATENDIENDO por este usuario',
      );
    }

    const privateRoom = `queue:${finished.branchId}:${finished.serviceId}`;
    const publicRoom = `public:queue:${finished.branchId}:${finished.serviceId}`;

    this.websocketGateway.server
      .to(privateRoom)
      .emit('ticket:finished', finished);
    this.websocketGateway.server.to(publicRoom).emit('ticket:finished', {
      id: finished.id,
      code: finished.code,
    });

    return {
      message: `Atención del ticket "${finished.code}" finalizada correctamente`,
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
        cancelledAt: new Date(),
        updatedAt: new Date(),
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
        branchId: schema.tickets.branchId,
        serviceId: schema.tickets.serviceId,
        status: schema.tickets.status,
      });

    if (!cancelled) {
      throw new BadRequestException(
        'No se puede cancelar: el ticket ya está en atención o finalizado',
      );
    }

    const privateRoom = `queue:${cancelled.branchId}:${cancelled.serviceId}`;
    const publicRoom = `public:queue:${cancelled.branchId}:${cancelled.serviceId}`;

    this.websocketGateway.server
      .to(privateRoom)
      .emit('ticket:cancelled', cancelled);
    this.websocketGateway.server.to(publicRoom).emit('ticket:cancelled', {
      id: cancelled.id,
      code: cancelled.code,
    });

    return { message: `Ticket "${cancelled.code}" cancelado` };
  }
}
