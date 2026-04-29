import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Public } from '@/auth/decorators/public.decorator';
import type { Request } from 'express';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Public()
  create(@Body() createTicketDto: CreateTicketDto, @Req() req: Request) {
    return this.ticketsService.create(createTicketDto, buildAuditContext(req));
  }
}
