import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@/users/interfaces/user.interface';

import { CustomerServiceService } from './customer-service.service';
import { OperatorQueueQueryDto } from './dto/operator-queue-query.dto';
import { CallNextDto } from './dto/call-next.dto';
import type { CustomerServiceQueueResponse } from './dto/operator-queue-response.dto';
import { AdminTicketTimelineQueryDto } from './dto/admin-ticket-timeline-query.dto';
import type { TicketAttentionTimelineListResponse } from './dto/ticket-attention-timeline-response.dto';

type UserRequest = Request & { user: User };

@Controller('customer-service')
export class CustomerServiceController {
  constructor(
    private readonly customerServiceService: CustomerServiceService,
  ) {}

  @Get('queue')
  findQueue(
    @Query() query: OperatorQueueQueryDto,
    @Req() req: UserRequest,
  ): Promise<CustomerServiceQueueResponse> {
    const { branchId, serviceId, page, limit, search } = query;

    return this.customerServiceService.findPendingTicketsByUserServiceWindow(
      req.user.id,
      branchId,
      serviceId,
      { page, limit, search },
    );
  }

  @Get('timelines')
  findAllTimelines(
    @Query() query: AdminTicketTimelineQueryDto,
  ): Promise<TicketAttentionTimelineListResponse> {
    return this.customerServiceService.findTicketAttentionTimelines(query);
  }

  @Post('queue/call-next')
  callNext(@Body() dto: CallNextDto, @Req() req: UserRequest) {
    return this.customerServiceService.callNextTicket(
      dto.branchId,
      dto.serviceId,
      req.user.id,
    );
  }

  @Patch(':ticketId/recall')
  recall(@Param('ticketId') ticketId: string, @Req() req: UserRequest) {
    return this.customerServiceService.recallTicket(ticketId, req.user.id);
  }

  @Patch(':ticketId/hold')
  hold(@Param('ticketId') ticketId: string, @Req() req: UserRequest) {
    return this.customerServiceService.holdTicket(ticketId, req.user.id);
  }

  @Patch(':ticketId/start')
  start(@Param('ticketId') ticketId: string, @Req() req: UserRequest) {
    return this.customerServiceService.startTicketAttention(
      ticketId,
      req.user.id,
    );
  }

  @Patch(':ticketId/finish')
  finish(@Param('ticketId') ticketId: string, @Req() req: UserRequest) {
    return this.customerServiceService.finishTicketAttention(
      ticketId,
      req.user.id,
    );
  }

  @Patch(':ticketId/cancel')
  cancel(@Param('ticketId') ticketId: string, @Req() req: UserRequest) {
    return this.customerServiceService.cancelTicket(ticketId, req.user.id);
  }
}
