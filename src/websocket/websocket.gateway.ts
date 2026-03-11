import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Server, Socket } from 'socket.io';
import { AuthService } from '@/auth/auth.service';
import type { User } from '@/users/interfaces/user.interface';
import type {
  PublicDisplayTicket,
  TicketStatus,
} from '@/public/interfaces/public.interface';

type QueueJoinBody = {
  branchId: string;
  serviceId: string;
};

type DashboardJoinBody = {
  branchId?: string;
};

type RateJoinBody = {
  branchId: string;
  windowId: string;
};

type SocketData = {
  user?: User;
};

type AuthPayload = {
  token?: string;
};

type AuthReadyPayload = {
  ok: true;
  userId: string;
};

type PublicJoinAck =
  | { ok: true; room: string }
  | { ok: false; message: string };

type DashboardJoinAck =
  | { ok: true; rooms: string[] }
  | { ok: false; message: string };

type RateRatingPayload = {
  score: number;
  ratedAt: Date;
};

type RateTicketEvent =
  | 'ticket:called'
  | 'ticket:recalled'
  | 'ticket:started'
  | 'ticket:resumed'
  | 'ticket:held'
  | 'ticket:finished'
  | 'ticket:cancelled'
  | 'ticket:rated'
  | 'rate:snapshot';

type RateTicketStatePayload = {
  event: RateTicketEvent;
  ticketId: string;
  code: string;
  type: 'REGULAR' | 'PREFERENCIAL';
  status: TicketStatus;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  windowId: string;
  windowName: string;
  calledAt: Date | null;
  createdAt: Date;
  canRate: boolean;
  isPaused: boolean;
  isRated: boolean;
  rating: RateRatingPayload | null;
  at: string;
};

type RateJoinAck =
  | { ok: true; room: string; ticket: RateTicketStatePayload | null }
  | { ok: false; message: string };

type DashboardInvalidatePayload = {
  event:
    | 'ticket:created'
    | 'ticket:called'
    | 'ticket:recalled'
    | 'ticket:started'
    | 'ticket:resumed'
    | 'ticket:held'
    | 'ticket:finished'
    | 'ticket:cancelled'
    | 'ticket:rated';
  ticketId?: string;
  branchId: string;
  serviceId?: string;
  at: string;
};

type ServerToClientEvents = {
  'auth:ready': (payload: AuthReadyPayload) => void;
  'dashboard:invalidate': (payload: DashboardInvalidatePayload) => void;
  'rate:ticket-state': (payload: RateTicketStatePayload) => void;
  'rate:ticket-rated': (payload: RateTicketStatePayload) => void;
};

type AuthedSocket = Socket<
  Record<string, never>,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    console.log(`Cliente conectado: ${client.id}`);

    const token = this.getAccessTokenFromSocket(client);
    if (!token) return;

    const payload = await this.authService
      .validatedAccessToken(token)
      .catch(() => null);
    if (!payload) return;

    const user = await this.authService.validateUser(payload).catch(() => null);
    if (!user) return;

    client.data.user = user;
    console.log(`Socket autenticado: ${client.id} user=${user.id}`);

    await client.join(`user:${user.id}`);
    client.emit('auth:ready', { ok: true, userId: user.id });
  }

  handleDisconnect(client: AuthedSocket) {
    console.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('public:join')
  async publicJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<PublicJoinAck> {
    const data = this.parseQueueJoinBody(body);
    if (!data) {
      return { ok: false, message: 'branchId y serviceId son requeridos' };
    }

    const validationMessage = await this.validatePublicScope(
      data.branchId,
      data.serviceId,
    );
    if (validationMessage) {
      return { ok: false, message: validationMessage };
    }

    const room = this.getPublicRoom(data.branchId, data.serviceId);
    await client.join(room);

    return { ok: true, room };
  }

  @SubscribeMessage('rate:join')
  async rateJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<RateJoinAck> {
    const data = this.parseRateJoinBody(body);
    if (!data) {
      return { ok: false, message: 'branchId y windowId son requeridos' };
    }

    const validationMessage = await this.validateRateScope(
      data.branchId,
      data.windowId,
    );
    if (validationMessage) {
      return { ok: false, message: validationMessage };
    }

    const room = this.getRateRoom(data.branchId, data.windowId);
    await client.join(room);

    const ticket = await this.findCurrentRateTicketState(
      data.branchId,
      data.windowId,
    );

    return { ok: true, room, ticket };
  }

  @SubscribeMessage('queue:register')
  async registerQueues(@ConnectedSocket() client: AuthedSocket) {
    const user = client.data.user;
    if (!user) return { ok: false, message: 'No autenticado' };

    const userBWs = await this.db.query.userBranchWindows.findMany({
      where: and(
        eq(schema.userBranchWindows.userId, user.id),
        eq(schema.userBranchWindows.isActive, true),
      ),
      columns: { branchId: true, branchWindowId: true },
    });

    if (userBWs.length === 0) {
      return { ok: true, rooms: [] };
    }

    const branchWindowIds = userBWs.map((r) => r.branchWindowId);
    const services = await this.db.query.branchWindowServices.findMany({
      where: and(
        inArray(schema.branchWindowServices.branchWindowId, branchWindowIds),
        eq(schema.branchWindowServices.isActive, true),
      ),
      columns: { branchWindowId: true, serviceId: true },
    });

    const bwToBranch = new Map<string, string>();
    for (const r of userBWs) bwToBranch.set(r.branchWindowId, r.branchId);

    const roomSet = new Set<string>();
    for (const s of services) {
      const branchId = bwToBranch.get(s.branchWindowId);
      if (!branchId) continue;
      roomSet.add(this.getQueueRoom(branchId, s.serviceId));
    }

    const rooms = Array.from(roomSet);
    for (const room of rooms) await client.join(room);

    return { ok: true, rooms };
  }

  @SubscribeMessage('queue:join')
  async queueJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    const user = client.data.user;
    if (!user) return { ok: false, message: 'No autenticado' };

    const data = this.parseQueueJoinBody(body);
    if (!data) return { ok: false, message: 'Datos incompletos' };

    const ubw = await this.db.query.userBranchWindows.findFirst({
      where: and(
        eq(schema.userBranchWindows.userId, user.id),
        eq(schema.userBranchWindows.branchId, data.branchId),
        eq(schema.userBranchWindows.isActive, true),
      ),
      columns: { branchWindowId: true },
    });

    if (!ubw?.branchWindowId) {
      return { ok: false, message: 'No tienes acceso a esa sucursal' };
    }

    const allowed = await this.db.query.branchWindowServices.findFirst({
      where: and(
        eq(schema.branchWindowServices.branchWindowId, ubw.branchWindowId),
        eq(schema.branchWindowServices.serviceId, data.serviceId),
        eq(schema.branchWindowServices.isActive, true),
      ),
      columns: { id: true },
    });

    if (!allowed) {
      return { ok: false, message: 'No tienes acceso a esa cola' };
    }

    const room = this.getQueueRoom(data.branchId, data.serviceId);
    await client.join(room);

    return { ok: true, room };
  }

  @SubscribeMessage('dashboard:join')
  async dashboardJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: unknown,
  ): Promise<DashboardJoinAck> {
    const user = client.data.user;
    if (!user) return { ok: false, message: 'No autenticado' };

    const parsed = this.parseDashboardJoinBody(body);
    if (!parsed) {
      return { ok: false, message: 'Formato invalido para dashboard:join' };
    }

    const rooms = [this.getDashboardGlobalRoom()];

    if (parsed?.branchId) {
      const branch = await this.db.query.branches.findFirst({
        where: and(
          eq(schema.branches.id, parsed.branchId),
          eq(schema.branches.isActive, true),
        ),
        columns: { id: true },
      });

      if (!branch) {
        return {
          ok: false,
          message: 'La sucursal no existe o esta inactiva',
        };
      }
    }

    await client.join(this.getDashboardGlobalRoom());

    if (parsed?.branchId) {
      const branchRoom = this.getDashboardBranchRoom(parsed.branchId);
      await client.join(branchRoom);
      rooms.push(branchRoom);
    }

    return { ok: true, rooms };
  }

  emitDashboardInvalidation(payload: {
    event: DashboardInvalidatePayload['event'];
    branchId: string;
    serviceId?: string;
    ticketId?: string;
  }) {
    const message: DashboardInvalidatePayload = {
      event: payload.event,
      branchId: payload.branchId,
      serviceId: payload.serviceId,
      ticketId: payload.ticketId,
      at: new Date().toISOString(),
    };

    this.server
      .to(this.getDashboardGlobalRoom())
      .emit('dashboard:invalidate', message);
    this.server
      .to(this.getDashboardBranchRoom(payload.branchId))
      .emit('dashboard:invalidate', message);
  }

  emitRateTicketState(
    event: Exclude<RateTicketEvent, 'rate:snapshot' | 'ticket:rated'>,
    ticket: PublicDisplayTicket,
  ) {
    this.emitRateStatePayload(event, ticket, null);
  }

  emitTicketRated(ticket: PublicDisplayTicket, rating: RateRatingPayload) {
    const queueRoom = this.getQueueRoom(ticket.branchId, ticket.serviceId);
    const publicRoom = this.getPublicRoom(ticket.branchId, ticket.serviceId);

    this.server.to(queueRoom).emit('ticket:rated', {
      ticketId: ticket.id,
      branchId: ticket.branchId,
      serviceId: ticket.serviceId,
      windowId: ticket.windowId,
      score: rating.score,
      ratedAt: rating.ratedAt,
    });
    this.server.to(publicRoom).emit('ticket:rated', {
      ticketId: ticket.id,
      branchId: ticket.branchId,
      serviceId: ticket.serviceId,
      windowId: ticket.windowId,
      score: rating.score,
      ratedAt: rating.ratedAt,
    });

    this.emitRateStatePayload('ticket:rated', ticket, rating);
    this.emitDashboardInvalidation({
      event: 'ticket:rated',
      ticketId: ticket.id,
      branchId: ticket.branchId,
      serviceId: ticket.serviceId,
    });
  }

  getQueueRoom(branchId: string, serviceId: string) {
    return `queue:${branchId}:${serviceId}`;
  }

  getPublicRoom(branchId: string, serviceId: string) {
    return `public:branch:${branchId}:service:${serviceId}`;
  }

  getRateRoom(branchId: string, windowId: string) {
    return `rate:branch:${branchId}:window:${windowId}`;
  }

  getDashboardGlobalRoom() {
    return 'dashboard:global';
  }

  getDashboardBranchRoom(branchId: string) {
    return `dashboard:branch:${branchId}`;
  }

  private getAccessTokenFromSocket(client: AuthedSocket): string | null {
    const auth = client.handshake.auth as AuthPayload | undefined;

    if (auth?.token && auth.token.length > 0) return auth.token;

    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = this.parseCookies(cookieHeader);
    const token = cookies.accessToken;

    return token && token.length > 0 ? token : null;
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    const out: Record<string, string> = {};

    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;

      const key = trimmed.slice(0, idx).trim();
      const val = decodeURIComponent(trimmed.slice(idx + 1).trim());

      if (key) out[key] = val;
    }

    return out;
  }

  private parseQueueJoinBody(body: unknown): QueueJoinBody | null {
    if (!this.isRecord(body)) return null;

    const maybe = body as Partial<QueueJoinBody>;
    if (
      typeof maybe.branchId === 'string' &&
      maybe.branchId.length > 0 &&
      typeof maybe.serviceId === 'string' &&
      maybe.serviceId.length > 0
    ) {
      return { branchId: maybe.branchId, serviceId: maybe.serviceId };
    }

    return null;
  }

  private parseRateJoinBody(body: unknown): RateJoinBody | null {
    if (!this.isRecord(body)) return null;

    const maybe = body as Partial<RateJoinBody>;
    if (
      typeof maybe.branchId === 'string' &&
      maybe.branchId.length > 0 &&
      typeof maybe.windowId === 'string' &&
      maybe.windowId.length > 0
    ) {
      return { branchId: maybe.branchId, windowId: maybe.windowId };
    }

    return null;
  }

  private parseDashboardJoinBody(body: unknown): DashboardJoinBody | null {
    if (body === undefined || body === null) return {};
    if (!this.isRecord(body)) return null;

    const maybe = body as Partial<DashboardJoinBody>;
    if (typeof maybe.branchId === 'undefined') {
      return {};
    }

    if (typeof maybe.branchId === 'string' && maybe.branchId.length > 0) {
      return { branchId: maybe.branchId };
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private async validatePublicScope(
    branchId: string,
    serviceId: string,
  ): Promise<string | null> {
    const [branch, service] = await Promise.all([
      this.db.query.branches.findFirst({
        where: and(
          eq(schema.branches.id, branchId),
          eq(schema.branches.isActive, true),
        ),
        columns: { id: true },
      }),
      this.db.query.services.findFirst({
        where: and(
          eq(schema.services.id, serviceId),
          eq(schema.services.isActive, true),
        ),
        columns: { id: true },
      }),
    ]);

    if (!branch) return 'La sucursal no existe o esta inactiva';
    if (!service) return 'El servicio no existe o esta inactivo';

    const availableInBranch = await this.db
      .select({ id: schema.branchWindowServices.id })
      .from(schema.branchWindowServices)
      .innerJoin(
        schema.branchWindows,
        eq(schema.branchWindowServices.branchWindowId, schema.branchWindows.id),
      )
      .where(
        and(
          eq(schema.branchWindows.branchId, branchId),
          eq(schema.branchWindows.isActive, true),
          eq(schema.branchWindowServices.serviceId, serviceId),
          eq(schema.branchWindowServices.isActive, true),
        ),
      )
      .limit(1);

    if (availableInBranch.length === 0) {
      return 'El servicio no esta habilitado para esta sucursal';
    }

    return null;
  }

  private async validateRateScope(
    branchId: string,
    windowId: string,
  ): Promise<string | null> {
    const [scope] = await this.db
      .select({ id: schema.branchWindows.id })
      .from(schema.branchWindows)
      .innerJoin(schema.branches, eq(schema.branchWindows.branchId, schema.branches.id))
      .innerJoin(schema.windows, eq(schema.branchWindows.windowId, schema.windows.id))
      .where(
        and(
          eq(schema.branchWindows.branchId, branchId),
          eq(schema.branchWindows.windowId, windowId),
          eq(schema.branchWindows.isActive, true),
          eq(schema.branches.isActive, true),
          eq(schema.windows.isActive, true),
        ),
      )
      .limit(1);

    if (!scope) {
      return 'La ventanilla no existe o no esta activa para esta sucursal';
    }

    return null;
  }

  private emitRateStatePayload(
    event: Exclude<RateTicketEvent, 'rate:snapshot'>,
    ticket: PublicDisplayTicket,
    rating: RateRatingPayload | null,
  ) {
    if (!ticket.windowId) return;

    const payload = this.buildRateStatePayload(event, ticket, rating);
    const room = this.getRateRoom(ticket.branchId, ticket.windowId);

    this.server.to(room).emit('rate:ticket-state', payload);

    if (event === 'ticket:rated') {
      this.server.to(room).emit('rate:ticket-rated', payload);
    }
  }

  private buildRateStatePayload(
    event: RateTicketEvent,
    ticket: PublicDisplayTicket,
    rating: RateRatingPayload | null,
  ): RateTicketStatePayload {
    const isRated = rating !== null;
    const canRate = ticket.status === 'FINALIZADO' && !isRated;

    return {
      event,
      ticketId: ticket.id,
      code: ticket.code,
      type: ticket.type,
      status: ticket.status,
      branchId: ticket.branchId,
      branchName: ticket.branchName,
      serviceId: ticket.serviceId,
      serviceName: ticket.serviceName,
      serviceCode: ticket.serviceCode,
      windowId: ticket.windowId,
      windowName: ticket.windowName,
      calledAt: ticket.calledAt,
      createdAt: ticket.createdAt,
      canRate,
      isPaused: ticket.status === 'ESPERA',
      isRated,
      rating,
      at: new Date().toISOString(),
    };
  }

  private async findCurrentRateTicketState(
    branchId: string,
    windowId: string,
  ): Promise<RateTicketStatePayload | null> {
    const activeStatuses: TicketStatus[] = [
      'LLAMADO',
      'ATENDIENDO',
      'ESPERA',
      'FINALIZADO',
    ];

    const [row] = await this.db
      .select({
        ticketId: schema.tickets.id,
        code: schema.tickets.code,
        type: schema.tickets.type,
        status: schema.tickets.status,
        branchId: schema.tickets.branchId,
        branchName: schema.branches.name,
        serviceId: schema.tickets.serviceId,
        serviceName: schema.services.name,
        serviceCode: schema.services.code,
        windowId: schema.windows.id,
        windowName: schema.windows.name,
        calledAt: schema.tickets.calledAt,
        createdAt: schema.tickets.createdAt,
        ratingScore: schema.ticketRatings.score,
        ratingRatedAt: schema.ticketRatings.ratedAt,
      })
      .from(schema.tickets)
      .innerJoin(schema.branches, eq(schema.tickets.branchId, schema.branches.id))
      .innerJoin(schema.services, eq(schema.tickets.serviceId, schema.services.id))
      .innerJoin(
        schema.branchWindowServices,
        eq(schema.tickets.branchWindowServiceId, schema.branchWindowServices.id),
      )
      .innerJoin(
        schema.branchWindows,
        eq(schema.branchWindowServices.branchWindowId, schema.branchWindows.id),
      )
      .innerJoin(schema.windows, eq(schema.branchWindows.windowId, schema.windows.id))
      .leftJoin(schema.ticketRatings, eq(schema.ticketRatings.ticketId, schema.tickets.id))
      .where(
        and(
          eq(schema.tickets.branchId, branchId),
          eq(schema.windows.id, windowId),
          inArray(schema.tickets.status, activeStatuses),
        ),
      )
      .orderBy(
        sql`CASE
          WHEN ${schema.tickets.status} = 'ATENDIENDO' THEN 0
          WHEN ${schema.tickets.status} = 'ESPERA' THEN 1
          WHEN ${schema.tickets.status} = 'LLAMADO' THEN 2
          WHEN ${schema.tickets.status} = 'FINALIZADO' THEN 3
          ELSE 4
        END`,
        sql`${schema.tickets.updatedAt} DESC`,
        sql`${schema.tickets.attentionFinishedAt} DESC NULLS LAST`,
        desc(schema.tickets.createdAt),
      )
      .limit(1);

    if (!row) return null;

    const ticket: PublicDisplayTicket = {
      id: row.ticketId,
      code: row.code,
      type: row.type,
      status: row.status,
      branchId: row.branchId,
      branchName: row.branchName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      serviceCode: row.serviceCode,
      windowId: row.windowId,
      windowName: row.windowName,
      calledAt: row.calledAt,
      createdAt: row.createdAt,
    };

    const rating =
      row.ratingScore !== null && row.ratingRatedAt !== null
        ? {
            score: row.ratingScore,
            ratedAt: row.ratingRatedAt,
          }
        : null;

    return this.buildRateStatePayload('rate:snapshot', ticket, rating);
  }
}
