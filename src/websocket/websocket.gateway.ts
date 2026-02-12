import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Server, Socket } from 'socket.io';
import { eq, and, inArray } from 'drizzle-orm';
import { AuthService } from '@/auth/auth.service';
import type { User } from '@/users/interfaces/user.interface';

type QueueJoinBody = {
  branchId: string;
  serviceId: string;
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

type ServerToClientEvents = {
  'auth:ready': (payload: AuthReadyPayload) => void;
};

type AuthedSocket = Socket<
  Record<string, never>, // ClientToServerEvents (no tipado por ahora)
  ServerToClientEvents, // ✅ ServerToClientEvents
  Record<string, never>, // InterServerEvents
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
    console.log(`✅ Cliente conectado: ${client.id}`);

    const token = this.getAccessTokenFromSocket(client);
    if (!token) return;

    const payload = await this.authService
      .validatedAccessToken(token)
      .catch(() => null);
    if (!payload) return;

    const user = await this.authService.validateUser(payload).catch(() => null);
    if (!user) return;

    client.data.user = user;

    console.log(`🔐 Socket autenticado: ${client.id} user=${user.id}`);

    await client.join(`user:${user.id}`);

    // ✅ IMPORTANTE: avisa al frontend que ya está listo para queue:register
    const ready: AuthReadyPayload = { ok: true, userId: user.id };
    client.emit('auth:ready', ready);
  }

  handleDisconnect(client: AuthedSocket) {
    console.log(`❌ Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('public:join')
  async publicJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    const data = this.parseQueueJoinBody(body);
    if (!data) return { ok: false, message: 'Datos incompletos' };

    // Banco PRO: público por sucursal+servicio (sin ventanilla)
    const room = `public:queue:${data.branchId}:${data.serviceId}`;
    await client.join(room);

    return { ok: true, room };
  }

  @SubscribeMessage('queue:register')
  async registerQueues(@ConnectedSocket() client: AuthedSocket) {
    const user = client.data.user;

    // ✅ Nunca usar throw en eventos con ACK
    if (!user) return { ok: false, message: 'No autenticado' };

    const userBWs = await this.db.query.userBranchWindows.findMany({
      where: and(
        eq(schema.userBranchWindows.userId, user.id),
        eq(schema.userBranchWindows.isActive, true),
      ),
      columns: { branchId: true, branchWindowId: true },
    });

    console.log('🔎 userBWs:', user.id, userBWs);

    if (userBWs.length === 0) {
      console.log('⚠️ queue:register -> sin userBranchWindows activos');
      return { ok: true, rooms: [] };
    }

    const branchWindowIds = userBWs.map((r) => r.branchWindowId);

    // servicios habilitados en esas ventanillas
    const services = await this.db.query.branchWindowServices.findMany({
      where: and(
        inArray(schema.branchWindowServices.branchWindowId, branchWindowIds),
        eq(schema.branchWindowServices.isActive, true),
      ),
      columns: { branchWindowId: true, serviceId: true },
    });

    console.log('🔎 services:', services);

    const bwToBranch = new Map<string, string>();
    for (const r of userBWs) bwToBranch.set(r.branchWindowId, r.branchId);

    const roomSet = new Set<string>();
    for (const s of services) {
      const branchId = bwToBranch.get(s.branchWindowId);
      if (!branchId) continue;
      roomSet.add(`queue:${branchId}:${s.serviceId}`);
    }

    const rooms = Array.from(roomSet);
    for (const room of rooms) await client.join(room);

    console.log('✅ rooms after queue:register:', Array.from(client.rooms));

    return { ok: true, rooms };
  }

  @SubscribeMessage('queue:join')
  async queueJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    const user = client.data.user;

    // ✅ nunca throw con ACK
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

    // validar que esa ventanilla tenga habilitado el servicio
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

    const room = `queue:${data.branchId}:${data.serviceId}`;
    await client.join(room);

    return { ok: true, room };
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
