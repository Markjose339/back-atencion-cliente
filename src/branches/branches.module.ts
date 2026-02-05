import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { DatabaseModule } from '@/database/database.module';
import { DepartmentsModule } from '@/departments/departments.module';

@Module({
  imports: [DatabaseModule, DepartmentsModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
