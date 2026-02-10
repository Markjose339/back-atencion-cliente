import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [WebsocketGateway],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
