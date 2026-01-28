import { Module } from '@nestjs/common';
import { ServiceWindowsService } from './service_windows.service';
import { ServiceWindowsController } from './service_windows.controller';
import { DatabaseModule } from '@/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ServiceWindowsController],
  providers: [ServiceWindowsService],
  exports: [ServiceWindowsService],
})
export class ServiceWindowsModule {}
