import { Module } from '@nestjs/common';
import { QzController } from './qz.controller';
import { QzService } from './qz.service';

@Module({
  controllers: [QzController],
  providers: [QzService],
})
export class QzModule {}
