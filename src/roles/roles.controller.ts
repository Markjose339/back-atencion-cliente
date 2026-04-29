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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import type { Request } from 'express';
import type { User } from '@/users/interfaces/user.interface';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

type UserRequest = Request & { user: User };

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  create(@Body() createRoleDto: CreateRoleDto, @Req() req: UserRequest) {
    return this.rolesService.create(
      createRoleDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.rolesService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @Req() req: UserRequest,
  ) {
    return this.rolesService.update(
      id,
      updateRoleDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: UserRequest) {
    return this.rolesService.remove(id, buildAuditContext(req, req.user.id));
  }
}
