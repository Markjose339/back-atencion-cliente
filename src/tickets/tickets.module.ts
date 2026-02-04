import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { DatabaseModule } from '@/database/database.module';
import { WebsocketModule } from '@/websocket/websocket.module';

@Module({
  imports: [DatabaseModule, WebsocketModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
