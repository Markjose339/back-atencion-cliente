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
    if (!user) throw new UnauthorizedException('No autenticado');

    const userBWs = await this.db.query.userBranchWindows.findMany({
      where: and(
        eq(schema.userBranchWindows.userId, user.id),
        eq(schema.userBranchWindows.isActive, true),
      ),
      columns: { branchId: true, branchWindowId: true },
    });

    if (userBWs.length === 0) return { ok: true, rooms: [] };

    const branchWindowIds = userBWs.map((r) => r.branchWindowId);

    // 2) servicios habilitados en esas ventanillas
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
      roomSet.add(`queue:${branchId}:${s.serviceId}`);
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
    if (!user) throw new UnauthorizedException('No autenticado');

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
      throw new UnauthorizedException('No tienes acceso a esa sucursal');
    }

    // 2) validar que esa ventanilla tenga habilitado el servicio
    const allowed = await this.db.query.branchWindowServices.findFirst({
      where: and(
        eq(schema.branchWindowServices.branchWindowId, ubw.branchWindowId),
        eq(schema.branchWindowServices.serviceId, data.serviceId),
        eq(schema.branchWindowServices.isActive, true),
      ),
      columns: { id: true },
    });

    if (!allowed) {
      throw new UnauthorizedException('No tienes acceso a esa cola');
    }

    const room = `queue:${data.branchId}:${data.serviceId}`;
    await client.join(room);

    return { ok: true, room };
  }

  private getAccessTokenFromSocket(client: AuthedSocket): string | null {
    const auth = client.handshake.auth as unknown;

    if (
      this.isRecord(auth) &&
      typeof auth.token === 'string' &&
      auth.token.length > 0
    ) {
      return auth.token;
    }

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

    const { branchId, serviceId } = body;

    if (
      typeof branchId === 'string' &&
      branchId.length > 0 &&
      typeof serviceId === 'string' &&
      serviceId.length > 0
    ) {
      return { branchId, serviceId };
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
