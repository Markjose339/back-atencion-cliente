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
import { WindowsService } from './windows.service';
import { CreateWindowDto } from './dto/create-window.dto';
import { UpdateWindowDto } from './dto/update-window.dto';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import type { Request } from 'express';
import type { User } from '@/users/interfaces/user.interface';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

type UserRequest = Request & { user: User };

@Controller('windows')
export class WindowsController {
  constructor(private readonly windowsService: WindowsService) {}

  @Post()
  create(@Body() createWindowDto: CreateWindowDto, @Req() req: UserRequest) {
    return this.windowsService.create(
      createWindowDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.windowsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.windowsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWindowDto: UpdateWindowDto,
    @Req() req: UserRequest,
  ) {
    return this.windowsService.update(
      id,
      updateWindowDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: UserRequest) {
    return this.windowsService.remove(id, buildAuditContext(req, req.user.id));
  }
}
