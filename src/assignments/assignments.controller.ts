// assignments.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { AssignmentsService } from './assignments.service';
import { CreateWindowServiceDto } from './dto/create-window-service.dto';
import { UpdateWindowServiceDto } from './dto/update-window-service.dto';
import { CreateOperatorAssignmentDto } from './dto/create-operator-assignment.dto';
import { UpdateOperatorAssignmentDto } from './dto/update-operator-assignment.dto';

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
