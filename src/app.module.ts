import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { JwtAuthGuard } from './auth/guards/jwt.guard';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/guards/roles.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { ConfigModule } from '@nestjs/config';
import { TicketsModule } from './tickets/tickets.module';
import { CustomerServiceModule } from './customer-service/customer-service.module';
import { WebsocketModule } from './websocket/websocket.module';
import { BranchesModule } from './branches/branches.module';
import { ServicesModule } from './services/services.module';
import { WindowsModule } from './windows/windows.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { PublicModule } from './public/public.module';
import { AdvertisementsModule } from './advertisements/advertisements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    DatabaseModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    TicketsModule,
    CustomerServiceModule,
    WebsocketModule,
    BranchesModule,
    ServicesModule,
    WindowsModule,
    AssignmentsModule,
    PublicModule,
    AdvertisementsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
