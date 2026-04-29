// assignments.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { AssignmentsService } from './assignments.service';
import { CreateWindowServiceDto } from './dto/create-window-service.dto';
import { UpdateWindowServiceDto } from './dto/update-window-service.dto';
import { CreateOperatorAssignmentDto } from './dto/create-operator-assignment.dto';
import { UpdateOperatorAssignmentDto } from './dto/update-operator-assignment.dto';
import { SyncWindowServicesDto } from './dto/sync-window-services.dto';
import { SyncOperatorAssignmentsDto } from './dto/sync-operator-assignments.dto';
import type { Request } from 'express';
import type { User } from '@/users/interfaces/user.interface';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

type UserRequest = Request & { user: User };

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post('window-services')
  createWindowService(@Body() dto: CreateWindowServiceDto, @Req() req: UserRequest) {
    return this.assignmentsService.createWindowService(
      dto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get('window-services')
  listWindowServices(@Query() pagination: PaginationDto) {
    return this.assignmentsService.listWindowServices(pagination);
  }

  @Get('window-services/:id')
  getWindowService(@Param('id') id: string) {
    return this.assignmentsService.getWindowServiceById(id);
  }

  @Put('window-services/sync')
  syncWindowServices(@Body() dto: SyncWindowServicesDto, @Req() req: UserRequest) {
    return this.assignmentsService.syncWindowServices(
      dto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Patch('window-services/:id')
  updateWindowService(
    @Param('id') id: string,
    @Body() dto: UpdateWindowServiceDto,
    @Req() req: UserRequest,
  ) {
    return this.assignmentsService.updateWindowService(
      id,
      dto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Delete('window-services/:id')
  deleteWindowService(@Param('id') id: string, @Req() req: UserRequest) {
    return this.assignmentsService.deleteWindowService(
      id,
      buildAuditContext(req, req.user.id),
    );
  }

  @Post('operators')
  createOperator(@Body() dto: CreateOperatorAssignmentDto, @Req() req: UserRequest) {
    return this.assignmentsService.createOperatorAssignment(
      dto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get('branches/:branchId/windows')
  listBranchWindows(@Param('branchId') branchId: string) {
    return this.assignmentsService.listBranchWindows(branchId);
  }

  @Get('branches/:branchId/config')
  getBranchConfig(@Param('branchId') branchId: string) {
    return this.assignmentsService.getBranchConfig(branchId);
  }

  @Put('operators/sync')
  syncOperators(@Body() dto: SyncOperatorAssignmentsDto, @Req() req: UserRequest) {
    return this.assignmentsService.syncOperatorAssignments(
      dto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get('operators')
  listOperators(@Query() pagination: PaginationDto) {
    return this.assignmentsService.listOperatorAssignments(pagination);
  }

  @Get('operators/:id')
  getOperator(@Param('id') id: string) {
    return this.assignmentsService.getOperatorAssignmentById(id);
  }

  @Patch('operators/:id')
  updateOperator(
    @Param('id') id: string,
    @Body() dto: UpdateOperatorAssignmentDto,
    @Req() req: UserRequest,
  ) {
    return this.assignmentsService.updateOperatorAssignment(
      id,
      dto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Delete('operators/:id')
  deleteOperator(@Param('id') id: string, @Req() req: UserRequest) {
    return this.assignmentsService.deleteOperatorAssignment(
      id,
      buildAuditContext(req, req.user.id),
    );
  }
}
