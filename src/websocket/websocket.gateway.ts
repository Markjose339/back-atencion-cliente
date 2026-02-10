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
import { Inject, UnauthorizedException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Server, Socket } from 'socket.io';
import { eq, and } from 'drizzle-orm';
import { AuthService } from '@/auth/auth.service';
import type { User } from '@/users/interfaces/user.interface';

type QueueJoinBody = {
  branchId: string;
  windowId: string;
  serviceId: string;
};

type SocketData = {
  user?: User;
};

type AuthedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
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
    console.log(`✅ Cliente conectado: ${client.id}`);

    const token = this.getAccessTokenFromSocket(client);

    // Si no hay token => conexión pública, listo.
    if (!token) return;

    // ✅ Sin try/catch: si token es inválido, que NO autentique (pero deja conexión viva)
    // Para eso, convertimos el error en "no autenticado" con .catch(() => null)
    const payload = await this.authService
      .validatedAccessToken(token)
      .catch(() => null);
    if (!payload) return;

    const user = await this.authService.validateUser(payload).catch(() => null);
    if (!user) return;

    client.data.user = user;

    console.log(`🔐 Socket autenticado: ${client.id} user=${user.id}`);

    await client.join(`user:${user.id}`);
  }

  handleDisconnect(client: AuthedSocket) {
    console.log(`❌ Cliente desconectado: ${client.id}`);
  }

  // =========================
  // ✅ PUBLICO (sin auth)
  // =========================
  @SubscribeMessage('public:join')
  async publicJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    const data = this.parseQueueJoinBody(body);
    if (!data) return { ok: false, message: 'Datos incompletos' };

    const room = `public:queue:${data.branchId}:${data.windowId}:${data.serviceId}`;
    await client.join(room);

    return { ok: true, room };
  }

  // =========================
  // ✅ PRIVADO (requiere JWT)
  // =========================
  @SubscribeMessage('queue:register')
  async registerQueues(@ConnectedSocket() client: AuthedSocket) {
    const user = client.data.user;
    if (!user) throw new UnauthorizedException('No autenticado');

    const queues = await this.db.query.branchWindowServices.findMany({
      where: eq(schema.branchWindowServices.userId, user.id),
      columns: { branchId: true, windowId: true, serviceId: true },
    });

    const rooms = queues.map(
      (q) => `queue:${q.branchId}:${q.windowId}:${q.serviceId}`,
    );

    for (const room of rooms) {
      await client.join(room);
    }

    return { ok: true, rooms };
  }

  @SubscribeMessage('queue:join')
  async queueJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    const user = client.data.user;
    if (!user) throw new UnauthorizedException('No autenticado');

    const data = this.parseQueueJoinBody(body);
    if (!data) return { ok: false, message: 'Datos incompletos' };

    const allowed = await this.db.query.branchWindowServices.findFirst({
      where: and(
        eq(schema.branchWindowServices.userId, user.id),
        eq(schema.branchWindowServices.branchId, data.branchId),
        eq(schema.branchWindowServices.windowId, data.windowId),
        eq(schema.branchWindowServices.serviceId, data.serviceId),
      ),
      columns: { id: true },
    });

    if (!allowed)
      throw new UnauthorizedException('No tienes acceso a esa cola');

    const room = `queue:${data.branchId}:${data.windowId}:${data.serviceId}`;
    await client.join(room);

    return { ok: true, room };
  }

  // =========================
  // Helpers
  // =========================
  private getAccessTokenFromSocket(client: AuthedSocket): string | null {
    // 1) handshake.auth.token (si lo envías)
    const auth = client.handshake.auth as unknown;

    if (
      this.isRecord(auth) &&
      typeof auth.token === 'string' &&
      auth.token.length > 0
    ) {
      return auth.token;
    }

    // 2) cookie accessToken
    const cookieHeader = client.handshake.headers.cookie;
    if (typeof cookieHeader !== 'string' || cookieHeader.length === 0)
      return null;

    const cookies = this.parseCookies(cookieHeader);
    const token = cookies.accessToken;

    return typeof token === 'string' && token.length > 0 ? token : null;
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

    const { branchId, windowId, serviceId } = body;

    if (
      typeof branchId === 'string' &&
      branchId.length > 0 &&
      typeof windowId === 'string' &&
      windowId.length > 0 &&
      typeof serviceId === 'string' &&
      serviceId.length > 0
    ) {
      return { branchId, windowId, serviceId };
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
