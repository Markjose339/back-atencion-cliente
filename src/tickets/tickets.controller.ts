import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Public } from '@/auth/decorators/public.decorator';
import type { Request } from 'express';
import { buildAuditContext } from '@/audit/utils/build-audit-context';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import type { User } from '@/users/interfaces/user.interface';

type UserRequest = Request & { user: User };

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Public()
  create(@Body() createTicketDto: CreateTicketDto, @Req() req: Request) {
    return this.ticketsService.create(createTicketDto, buildAuditContext(req));
  }

  @Post('sessions/branches/:branchId/reset')
  @Permissions('reiniciar tickets')
  resetBranchSession(
    @Param('branchId') branchId: string,
    @Req() req: UserRequest,
  ) {
    return this.ticketsService.resetBranchSession(
      branchId,
      req.user.id,
      buildAuditContext(req, req.user.id),
    );
  }
}
