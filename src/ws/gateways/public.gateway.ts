import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  namespace: 'public',
  cors: { origin: process.env.FRONTEND_URL },
})
export class PublicGateway {
  @WebSocketServer()
  server: Server;
}
