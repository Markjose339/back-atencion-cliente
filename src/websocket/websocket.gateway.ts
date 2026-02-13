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
import { and, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Server, Socket } from 'socket.io';
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

type PublicJoinAck =
  | { ok: true; room: string }
  | { ok: false; message: string };

type ServerToClientEvents = {
  'auth:ready': (payload: AuthReadyPayload) => void;
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

  getQueueRoom(branchId: string, serviceId: string) {
    return `queue:${branchId}:${serviceId}`;
  }

  getPublicRoom(branchId: string, serviceId: string) {
    return `public:branch:${branchId}:service:${serviceId}`;
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
}
