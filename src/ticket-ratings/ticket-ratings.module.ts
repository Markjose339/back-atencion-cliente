import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { TicketsModule } from '@/tickets/tickets.module';
import { WebsocketModule } from '@/websocket/websocket.module';
import { PublicModule } from '@/public/public.module';
import { TicketRatingsService } from './ticket-ratings.service';
import { TicketRatingsController } from './ticket-ratings.controller';

@Module({
  imports: [DatabaseModule, TicketsModule, WebsocketModule, PublicModule],
  controllers: [TicketRatingsController],
  providers: [TicketRatingsService],
  exports: [TicketRatingsService],
})
export class TicketRatingsModule {}
