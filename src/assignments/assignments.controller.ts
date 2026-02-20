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
} from '@nestjs/common';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { AssignmentsService } from './assignments.service';
import { CreateWindowServiceDto } from './dto/create-window-service.dto';
import { UpdateWindowServiceDto } from './dto/update-window-service.dto';
import { CreateOperatorAssignmentDto } from './dto/create-operator-assignment.dto';
import { UpdateOperatorAssignmentDto } from './dto/update-operator-assignment.dto';
import { SyncWindowServicesDto } from './dto/sync-window-services.dto';
import { SyncOperatorAssignmentsDto } from './dto/sync-operator-assignments.dto';

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post('window-services')
  createWindowService(@Body() dto: CreateWindowServiceDto) {
    return this.assignmentsService.createWindowService(dto);
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
  syncWindowServices(@Body() dto: SyncWindowServicesDto) {
    return this.assignmentsService.syncWindowServices(dto);
  }

  @Patch('window-services/:id')
  updateWindowService(
    @Param('id') id: string,
    @Body() dto: UpdateWindowServiceDto,
  ) {
    return this.assignmentsService.updateWindowService(id, dto);
  }

  @Delete('window-services/:id')
  deleteWindowService(@Param('id') id: string) {
    return this.assignmentsService.deleteWindowService(id);
  }

  @Post('operators')
  createOperator(@Body() dto: CreateOperatorAssignmentDto) {
    return this.assignmentsService.createOperatorAssignment(dto);
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
  syncOperators(@Body() dto: SyncOperatorAssignmentsDto) {
    return this.assignmentsService.syncOperatorAssignments(dto);
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
  ) {
    return this.assignmentsService.updateOperatorAssignment(id, dto);
  }

  @Delete('operators/:id')
  deleteOperator(@Param('id') id: string) {
    return this.assignmentsService.deleteOperatorAssignment(id);
  }
}
