import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { WebsocketGateway } from '@/websocket/websocket.gateway';

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
  ) {}

  async create(dto: CreateTicketDto) {
    const todayRange = this.getTodayRange();
    const lockKey = this.getLockKey(dto.type, dto.branchId);

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const lastTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.type, dto.type),
          eq(schema.tickets.branchId, dto.branchId),
          gte(schema.tickets.createdAt, todayRange.start),
          lte(schema.tickets.createdAt, todayRange.end),
        ),
        orderBy: desc(schema.tickets.createdAt),
        columns: { code: true },
      });

      const nextSequence = lastTicket
        ? Number(String(lastTicket.code).slice(1)) + 1
        : 1;

      const code = this.generateTicketCode(dto.type, nextSequence);

      const [ticket] = await tx
        .insert(schema.tickets)
        .values({
          code,
          packageCode: dto.packageCode,
          type: dto.type,
          status: 'PENDIENTE',
          branchId: dto.branchId,
          serviceId: dto.serviceId,
        })
        .returning({
          id: schema.tickets.id,
          code: schema.tickets.code,
          packageCode: schema.tickets.packageCode,
          type: schema.tickets.type,
          status: schema.tickets.status,
          branchId: schema.tickets.branchId,
          serviceId: schema.tickets.serviceId,
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

      return ticket;
    });
  }

  private generateTicketCode(
    type: 'REGULAR' | 'PREFERENCIAL',
    sequence: number,
  ): string {
    const prefix = this.PREFIXES[type];
    return `${prefix}${sequence.toString().padStart(4, '0')}`;
  }

  private getTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private getLockKey(
    type: 'REGULAR' | 'PREFERENCIAL',
    branchId: string,
  ): number {
    const today = new Date().toISOString().slice(0, 10);
    const base = type === 'REGULAR' ? 1 : 2;

    const key = `${today}|${base}|${branchId}`;
    let hash = 0;

    for (const char of key) {
      hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
    }

    return hash === 0 ? 1 : hash;
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
}
