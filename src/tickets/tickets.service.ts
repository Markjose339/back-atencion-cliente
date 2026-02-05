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
  };

  private readonly PACKAGE_TO_VENTANILLA_ARRAY = [
    { packageCode: 'PKG-DIR-001', ventanillaCode: 'DD' },
    { packageCode: 'PKG-DIR-002', ventanillaCode: 'DD' },
    { packageCode: 'PKG-DIR-003', ventanillaCode: 'DD' },
    { packageCode: 'DIR-2024-001', ventanillaCode: 'DD' },
    { packageCode: 'DIR-2024-002', ventanillaCode: 'DD' },
    { packageCode: 'PKG-DNI-001', ventanillaCode: 'DND' },
    { packageCode: 'PKG-DNI-002', ventanillaCode: 'DND' },
    { packageCode: 'PKG-PAS-001', ventanillaCode: 'DND' },
    { packageCode: 'DND-2024-001', ventanillaCode: 'DND' },
    { packageCode: 'DND-2024-002', ventanillaCode: 'DND' },
    { packageCode: 'PKG-EMS-001', ventanillaCode: 'EMS' },
    { packageCode: 'PKG-EMS-002', ventanillaCode: 'EMS' },
    { packageCode: 'PKG-ENV-001', ventanillaCode: 'EMS' },
    { packageCode: 'EMS-2024-001', ventanillaCode: 'EMS' },
    { packageCode: 'EMS-2024-002', ventanillaCode: 'EMS' },
    { packageCode: 'PKG-URG-001', ventanillaCode: 'UR' },
    { packageCode: 'PKG-REC-001', ventanillaCode: 'UR' },
    { packageCode: 'PKG-REC-002', ventanillaCode: 'UR' },
    { packageCode: 'UR-2024-001', ventanillaCode: 'UR' },
    { packageCode: 'UR-2024-002', ventanillaCode: 'UR' },
  ];

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  async create(dto: CreateTicketDto) {
    const todayRange = this.getTodayRange();
    const lockKey = this.getLockKey(dto.type);

    const found = this.PACKAGE_TO_VENTANILLA_ARRAY.find(
      (item) => item.packageCode === dto.packageCode,
    );

    if (!found) {
      throw new NotFoundException(
        `El paquete con el Codigo ${dto.packageCode} no encontrado`,
      );
    }
    const serviceWindow = await this.db.query.serviceWindows.findFirst({
      where: eq(schema.serviceWindows.code, found.ventanillaCode),
    });

    if (!serviceWindow) {
      throw new NotFoundException(
        `Ventanilla ${found.ventanillaCode} no encontrada`,
      );
    }

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
      const lastTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(schema.tickets.type, dto.type),
          gte(schema.tickets.createdAt, todayRange.start),
          lte(schema.tickets.createdAt, todayRange.end),
        ),
        orderBy: desc(schema.tickets.createdAt),
      });

      const nextSequence = lastTicket
        ? Number(lastTicket.code.slice(1)) + 1
        : 1;

      const code = this.generateTicketCode(dto.type, nextSequence);

      const [ticket] = await tx
        .insert(schema.tickets)
        .values({
          code,
          packageCode: dto.packageCode,
          type: dto.type,
          serviceWindowId: serviceWindow.id,
        })
        .returning({
          id: schema.tickets.id,
          code: schema.tickets.code,
          packageCode: schema.tickets.packageCode,
          createdAt: schema.tickets.createdAt,
        });

      this.websocketGateway.server.to('tickets').emit('ticket:created', ticket);

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

  private getLockKey(type: 'REGULAR' | 'PREFERENCIAL'): number {
    const today = new Date().toISOString().slice(0, 10);
    const base = type === 'REGULAR' ? 1 : 2;

    let hash = base;
    for (const char of today) {
      hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
    }

    return hash;
  }

  async validatedTicketId(id: string) {
    const ticket = await this.db.query.tickets.findFirst({
      where: eq(schema.tickets.id, id),
      columns: {
        id: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket con el id ${id} no encontrado`);
    }
  }
}
