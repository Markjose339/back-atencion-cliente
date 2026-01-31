import { Module } from '@nestjs/common';
import { CustomerServiceController } from './customer-service.controller';
import { CustomerServiceService } from './customer-service.service';
import { DatabaseModule } from '@/database/database.module';
import { TicketsModule } from '@/tickets/tickets.module';
import { UsersModule } from '@/users/users.module';

@Module({
  imports: [DatabaseModule, TicketsModule, UsersModule],
  controllers: [CustomerServiceController],
  providers: [CustomerServiceService],
})
export class CustomerServiceModule {}
