import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { PublicService } from '@/public/public.service';
import { TicketsService } from '@/tickets/tickets.service';
import { WebsocketGateway } from '@/websocket/websocket.gateway';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateTicketRatingDto } from './dto/create-ticket-rating.dto';

type TicketStatus =
  | 'PENDIENTE'
  | 'LLAMADO'
  | 'ATENDIENDO'
  | 'ESPERA'
  | 'FINALIZADO'
  | 'CANCELADO';

@Injectable()
export class TicketRatingsService {
  private readonly logger = new Logger(TicketRatingsService.name);

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly ticketsService: TicketsService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly publicService: PublicService,
  ) {}

  async create(dto: CreateTicketRatingDto) {
    const ticket = await this.db.query.tickets.findFirst({
      where: eq(schema.tickets.id, dto.ticketId),
      columns: {
        id: true,
        status: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(
        `Ticket con el id ${dto.ticketId} no encontrado`,
      );
    }

    if (ticket.status !== ('FINALIZADO' as TicketStatus)) {
      throw new BadRequestException(
        'Solo se puede calificar un ticket cuando esta FINALIZADO',
      );
    }

    const existing = await this.db.query.ticketRatings.findFirst({
      where: eq(schema.ticketRatings.ticketId, dto.ticketId),
      columns: { id: true },
    });

    if (existing) {
      throw new ConflictException('Este ticket ya fue calificado');
    }

    try {
      const [rating] = await this.db
        .insert(schema.ticketRatings)
        .values({
          ticketId: dto.ticketId,
          score: dto.score,
        })
        .returning({
          id: schema.ticketRatings.id,
          ticketId: schema.ticketRatings.ticketId,
          score: schema.ticketRatings.score,
          ratedAt: schema.ticketRatings.ratedAt,
        });

      await this.emitTicketRatedRealtime(rating.ticketId, {
        score: rating.score,
        ratedAt: rating.ratedAt,
      });

      return rating;
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Este ticket ya fue calificado');
      }

      throw error;
    }
  }

  async findByTicketId(ticketId: string) {
    await this.ticketsService.validatedTicketId(ticketId);

    const rating = await this.db.query.ticketRatings.findFirst({
      where: eq(schema.ticketRatings.ticketId, ticketId),
      columns: {
        id: true,
        ticketId: true,
        score: true,
        ratedAt: true,
      },
    });

    return rating ?? null;
  }

  private async emitTicketRatedRealtime(
    ticketId: string,
    rating: { score: number; ratedAt: Date },
  ) {
    try {
      const displayTicket =
        await this.publicService.getDisplayTicketById(ticketId);
      if (!displayTicket || !displayTicket.windowId) return;

      this.websocketGateway.emitTicketRated(displayTicket, rating);
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo emitir evento ticket:rated para ticket ${ticketId}`,
      );
      this.logger.debug(String(error));
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    return (
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      (error as { code: string }).code === '23505'
    );
  }
}
