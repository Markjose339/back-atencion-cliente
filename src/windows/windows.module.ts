import { Module } from '@nestjs/common';
import { WindowsService } from './windows.service';
import { WindowsController } from './windows.controller';
import { DatabaseModule } from '@/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [WindowsController],
  providers: [WindowsService],
  exports: [WindowsService],
})
export class WindowsModule {}
