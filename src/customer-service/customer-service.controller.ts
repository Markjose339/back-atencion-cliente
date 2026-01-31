import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { CustomerServiceService } from './customer-service.service';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { User } from '@/users/interfaces/user.interface';

@Controller('customer-service')
export class CustomerServiceController {
  constructor(
    private readonly customerServiceService: CustomerServiceService,
  ) {}

  @Get()
  findPendingTicketsByUserServiceWindow(
    @Query() paginationDto: PaginationDto,
    @Req() req: Request & { user: User },
  ) {
    return this.customerServiceService.findPendingTicketsByUserServiceWindow(
      req.user.id,
      paginationDto,
    );
  }

  @Patch(':ticketId/start')
  startTicketAttention(
    @Param('ticketId') ticketId: string,
    @Req() req: Request & { user: User },
  ) {
    return this.customerServiceService.startTicketAttention(
      ticketId,
      req.user.id,
    );
  }

  @Patch(':ticketId/end')
  endTicketAttention(
    @Param('ticketId') ticketId: string,
    @Req() req: Request & { user: User },
  ) {
    return this.customerServiceService.endTicketAttention(
      ticketId,
      req.user.id,
    );
  }
}
