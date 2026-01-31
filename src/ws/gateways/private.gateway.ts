import { UseGuards } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { WsJwtGuard } from '../guards/ws-jwt.guard';

@WebSocketGateway({
  namespace: 'private',
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class PrivateGateway {
  @WebSocketServer()
  server: Server;
}
