import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import type { Request } from 'express';
import type { User } from '@/users/interfaces/user.interface';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

type UserRequest = Request & { user: User };

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  create(@Body() createServiceDto: CreateServiceDto, @Req() req: UserRequest) {
    return this.servicesService.create(
      createServiceDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.servicesService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateServiceDto: UpdateServiceDto,
    @Req() req: UserRequest,
  ) {
    return this.servicesService.update(
      id,
      updateServiceDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: UserRequest) {
    return this.servicesService.remove(id, buildAuditContext(req, req.user.id));
  }
}
