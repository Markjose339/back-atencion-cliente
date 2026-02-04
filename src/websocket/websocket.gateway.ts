// websocket.gateway.ts
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket) {
    console.log(`✅ Cliente conectado: ${client.id}`);
    await client.join('tickets');
    console.log(
      `📍 Cliente ${client.id} unido automáticamente al room 'tickets'`,
    );
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ Cliente desconectado: ${client.id}`);
  }

  /*  @SubscribeMessage('join:tickets')
  async handleJoinTickets(client: Socket) {
    await client.join('tickets');
    console.log(
      `📍 Cliente ${client.id} se unió manualmente al room 'tickets'`,
    );
    return { success: true };
  } */
}
