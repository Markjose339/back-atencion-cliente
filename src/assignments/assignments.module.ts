import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { DatabaseModule } from '@/database/database.module';
import { BranchesModule } from '@/branches/branches.module';
import { WindowsModule } from '@/windows/windows.module';
import { UsersModule } from '@/users/users.module';
import { ServicesModule } from '@/services/services.module';

@Module({
  imports: [
    DatabaseModule,
    BranchesModule,
    WindowsModule,
    UsersModule,
    ServicesModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
