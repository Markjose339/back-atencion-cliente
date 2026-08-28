import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { WebsocketGateway } from '@/websocket/websocket.gateway';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom, of } from 'rxjs';
import { ExternalPackageResponse } from './interfaces/external-package-response.interface';
import { AuditService } from '@/audit/audit.service';
import type { AuditContext } from '@/audit/interfaces/audit-log.interface';

@Injectable()
export class TicketsService {
  private readonly PREFIXES = {
    REGULAR: 'R',
    PREFERENCIAL: 'P',
  } as const;

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly websocketGateway: WebsocketGateway,
    private readonly httpService: HttpService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateTicketDto, auditContext?: AuditContext) {
    const businessDate = this.getBoliviaBusinessDate();
    const lockKey = this.getSessionLockKey(dto.branchId);

    const packageZone = dto.packageCode
      ? await this.fetchPackageZone(dto.packageCode)
      : null;

    return this.db.transaction(async (tx) => {
      const branch = await tx.query.branches.findFirst({
        where: eq(schema.branches.id, dto.branchId),
        columns: { name: true },
      });

      if (!branch) {
        throw new NotFoundException(
          `Sucursal con id ${dto.branchId} no encontrada`,
        );
      }

      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      let session = await tx.query.ticketSessions.findFirst({
        where: and(
          eq(schema.ticketSessions.branchId, dto.branchId),
          eq(schema.ticketSessions.isActive, true),
        ),
        columns: {
          id: true,
          businessDate: true,
          sessionNumber: true,
        },
      });

      if (session && session.businessDate !== businessDate) {
        await tx
          .update(schema.ticketSessions)
          .set({
            isActive: false,
            closedAt: sql`now()`,
            closeReason: 'cambio_de_dia',
          })
          .where(eq(schema.ticketSessions.id, session.id));
        session = undefined;
      }

      if (!session) {
        const [lastSession] = await tx
          .select({ value: sql<number>`COALESCE(MAX(${schema.ticketSessions.sessionNumber}), 0)` })
          .from(schema.ticketSessions)
          .where(
            and(
              eq(schema.ticketSessions.branchId, dto.branchId),
              eq(schema.ticketSessions.businessDate, businessDate),
            ),
          );

        const [createdSession] = await tx
          .insert(schema.ticketSessions)
          .values({
            branchId: dto.branchId,
            businessDate,
            sessionNumber: Number(lastSession?.value ?? 0) + 1,
          })
          .returning({
            id: schema.ticketSessions.id,
            businessDate: schema.ticketSessions.businessDate,
            sessionNumber: schema.ticketSessions.sessionNumber,
          });
        session = createdSession;
      }

      const counterColumn =
        dto.type === 'REGULAR'
          ? schema.ticketSessions.regularCounter
          : schema.ticketSessions.preferentialCounter;
      const [updatedSession] = await tx
        .update(schema.ticketSessions)
        .set({ [dto.type === 'REGULAR' ? 'regularCounter' : 'preferentialCounter']: sql`${counterColumn} + 1` })
        .where(eq(schema.ticketSessions.id, session.id))
        .returning({
          regularCounter: schema.ticketSessions.regularCounter,
          preferentialCounter: schema.ticketSessions.preferentialCounter,
        });

      const nextSequence =
        dto.type === 'REGULAR'
          ? updatedSession.regularCounter
          : updatedSession.preferentialCounter;

      const code = this.generateTicketCode(dto.type, nextSequence);

      const [ticket] = await tx
        .insert(schema.tickets)
        .values({
          code,
          sequenceNumber: nextSequence,
          ticketSessionId: session.id,
          packageCode: dto.packageCode,
          packageZone,
          type: dto.type,
          status: 'PENDIENTE',
          branchId: dto.branchId,
          serviceId: dto.serviceId,
        })
        .returning({
          id: schema.tickets.id,
          code: schema.tickets.code,
          packageCode: schema.tickets.packageCode,
          packageZone: schema.tickets.packageZone,
          type: schema.tickets.type,
          status: schema.tickets.status,
          createdAt: schema.tickets.createdAt,
        });

      const privateRoom = this.websocketGateway.getQueueRoom(
        dto.branchId,
        dto.serviceId,
      );
      this.websocketGateway.server
        .to(privateRoom)
        .emit('ticket:created', ticket);

      const publicRoom = this.websocketGateway.getPublicRoom(
        dto.branchId,
        dto.serviceId,
      );
      this.websocketGateway.server.to(publicRoom).emit('ticket:created', {
        id: ticket.id,
        code: ticket.code,
        type: ticket.type,
        status: ticket.status,
        createdAt: ticket.createdAt,
      });

      this.websocketGateway.emitDashboardInvalidation({
        event: 'ticket:created',
        ticketId: ticket.id,
        branchId: dto.branchId,
        serviceId: dto.serviceId,
      });

      const response = {
        ...ticket,
        branchName: branch.name,
      };

      await this.auditService.registerAuditLog(
        {
          action: 'ticket_created',
          auditableType: 'Ticket',
          auditableId: ticket.id,
          description: `Ticket ${ticket.code} creado`,
        },
        auditContext,
      );

      return response;
    });
  }

  private generateTicketCode(
    type: 'REGULAR' | 'PREFERENCIAL',
    sequence: number,
  ): string {
    const prefix = this.PREFIXES[type];
    return `${prefix}${sequence.toString().padStart(4, '0')}`;
  }

  private getBoliviaBusinessDate(): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/La_Paz',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts
        .filter((part) => ['year', 'month', 'day'].includes(part.type))
        .map((part) => [part.type, part.value]),
    );

    return `${values.year}-${values.month}-${values.day}`;
  }

  private getSessionLockKey(branchId: string): number {
    const key = `ticket-session|${branchId}`;
    let hash = 0;

    for (const char of key) {
      hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
    }

    return hash === 0 ? 1 : hash;
  }

  async resetBranchSession(
    branchId: string,
    userId: string,
    auditContext?: AuditContext,
  ) {
    const businessDate = this.getBoliviaBusinessDate();
    const lockKey = this.getSessionLockKey(branchId);
    const activeStatuses = ['PENDIENTE', 'LLAMADO', 'ATENDIENDO', 'ESPERA'] as const;

    const result = await this.db.transaction(async (tx) => {
      const branch = await tx.query.branches.findFirst({
        where: eq(schema.branches.id, branchId),
        columns: { id: true, name: true },
      });
      if (!branch) {
        throw new NotFoundException(`Sucursal con el id ${branchId} no encontrada`);
      }

      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const activeSession = await tx.query.ticketSessions.findFirst({
        where: and(
          eq(schema.ticketSessions.branchId, branchId),
          eq(schema.ticketSessions.isActive, true),
        ),
        columns: { id: true, sessionNumber: true },
      });

      const cancelledTickets = await tx
        .update(schema.tickets)
        .set({
          status: 'CANCELADO',
          cancelledAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(schema.tickets.branchId, branchId),
            inArray(schema.tickets.status, activeStatuses),
          ),
        )
        .returning({ id: schema.tickets.id });

      if (activeSession) {
        await tx
          .update(schema.ticketSessions)
          .set({
            isActive: false,
            closedAt: sql`now()`,
            closedByUserId: userId,
            closeReason: 'reinicio_manual',
          })
          .where(eq(schema.ticketSessions.id, activeSession.id));
      }

      const [lastSession] = await tx
        .select({ value: sql<number>`COALESCE(MAX(${schema.ticketSessions.sessionNumber}), 0)` })
        .from(schema.ticketSessions)
        .where(
          and(
            eq(schema.ticketSessions.branchId, branchId),
            eq(schema.ticketSessions.businessDate, businessDate),
          ),
        );

      const [session] = await tx
        .insert(schema.ticketSessions)
        .values({
          branchId,
          businessDate,
          sessionNumber: Number(lastSession?.value ?? 0) + 1,
        })
        .returning({
          id: schema.ticketSessions.id,
          businessDate: schema.ticketSessions.businessDate,
          sessionNumber: schema.ticketSessions.sessionNumber,
        });

      return { branch, session, cancelledTicketIds: cancelledTickets.map((ticket) => ticket.id) };
    });

    for (const ticketId of result.cancelledTicketIds) {
      const ticket = await this.getDisplayTicketById(ticketId);
      if (!ticket) continue;
      const privateRoom = this.websocketGateway.getQueueRoom(ticket.branchId, ticket.serviceId);
      const publicRoom = this.websocketGateway.getPublicRoom(ticket.branchId, ticket.serviceId);
      this.websocketGateway.server.to(privateRoom).emit('ticket:cancelled', ticket);
      this.websocketGateway.server.to(publicRoom).emit('ticket:cancelled', ticket);
      this.websocketGateway.emitRateTicketState('ticket:cancelled', ticket);
      this.websocketGateway.emitDashboardInvalidation({
        event: 'ticket:cancelled',
        ticketId: ticket.id,
        branchId: ticket.branchId,
        serviceId: ticket.serviceId,
      });
    }

    await this.auditService.registerAuditLog(
      {
        action: 'ticket_session_reset',
        auditableType: 'TicketSession',
        auditableId: result.session.id,
        newValues: {
          branchId,
          businessDate: result.session.businessDate,
          sessionNumber: result.session.sessionNumber,
          cancelledTickets: result.cancelledTicketIds.length,
        },
        description: `Jornada de tickets reiniciada manualmente en ${result.branch.name}`,
      },
      auditContext,
    );

    return {
      message: 'Jornada reiniciada correctamente',
      branchId,
      businessDate: result.session.businessDate,
      sessionNumber: result.session.sessionNumber,
      cancelledTickets: result.cancelledTicketIds.length,
    };
  }

  private async getDisplayTicketById(ticketId: string) {
    const [ticket] = await this.db
      .select({
        id: schema.tickets.id,
        code: schema.tickets.code,
        type: schema.tickets.type,
        status: schema.tickets.status,
        branchId: schema.tickets.branchId,
        branchName: schema.branches.name,
        serviceId: schema.tickets.serviceId,
        serviceName: schema.services.name,
        serviceCode: schema.services.code,
        windowId: sql<string>`COALESCE(${schema.windows.id}, '')`,
        windowName: sql<string>`COALESCE(${schema.windows.name}, '')`,
        calledAt: schema.tickets.calledAt,
        createdAt: schema.tickets.createdAt,
      })
      .from(schema.tickets)
      .innerJoin(schema.branches, eq(schema.tickets.branchId, schema.branches.id))
      .innerJoin(schema.services, eq(schema.tickets.serviceId, schema.services.id))
      .leftJoin(schema.branchWindowServices, eq(schema.tickets.branchWindowServiceId, schema.branchWindowServices.id))
      .leftJoin(schema.branchWindows, eq(schema.branchWindowServices.branchWindowId, schema.branchWindows.id))
      .leftJoin(schema.windows, eq(schema.branchWindows.windowId, schema.windows.id))
      .where(eq(schema.tickets.id, ticketId))
      .limit(1);

    return ticket;
  }

  async validatedTicketId(id: string) {
    const ticket = await this.db.query.tickets.findFirst({
      where: eq(schema.tickets.id, id),
      columns: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket con el id ${id} no encontrado`);
    }
  }

  private async fetchPackageZone(packageCode: string): Promise<string | null> {
    const response = await firstValueFrom(
      this.httpService
        .get<ExternalPackageResponse>(
          `http://172.65.10.52:8012/api/public/zona-paquete?codigo=${packageCode}`,
        )
        .pipe(catchError(() => of(null))),
    );

    return response?.data?.zona ?? null;
  }
}
