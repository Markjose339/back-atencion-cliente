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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import type { Request } from 'express';
import type { User } from '@/users/interfaces/user.interface';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

type UserRequest = Request & { user: User };

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  create(
    @Body() createPermissionDto: CreatePermissionDto,
    @Req() req: UserRequest,
  ) {
    return this.permissionsService.create(
      createPermissionDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.permissionsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
    @Req() req: UserRequest,
  ) {
    return this.permissionsService.update(
      id,
      updatePermissionDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: UserRequest) {
    return this.permissionsService.remove(
      id,
      buildAuditContext(req, req.user.id),
    );
  }
}
