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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import type { Request } from 'express';
import type { User } from './interfaces/user.interface';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

type UserRequest = Request & { user: User };

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto, @Req() req: UserRequest) {
    return this.usersService.create(
      createUserDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.usersService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: UserRequest,
  ) {
    return this.usersService.update(
      id,
      updateUserDto,
      buildAuditContext(req, req.user.id),
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: UserRequest) {
    return this.usersService.remove(id, buildAuditContext(req, req.user.id));
  }
}
