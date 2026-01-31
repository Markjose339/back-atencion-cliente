import { AuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { PrivateGateway } from './gateways/private.gateway';
import { PublicGateway } from './gateways/public.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [AuthModule],
  providers: [PrivateGateway, PublicGateway, WsJwtGuard],
  exports: [PrivateGateway, PublicGateway],
})
export class WsModule {}
