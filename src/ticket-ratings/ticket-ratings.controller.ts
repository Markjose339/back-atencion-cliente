import { Public } from '@/auth/decorators/public.decorator';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateTicketRatingDto } from './dto/create-ticket-rating.dto';
import { TicketRatingsService } from './ticket-ratings.service';

@Controller('ticket-ratings')
export class TicketRatingsController {
  constructor(private readonly ticketRatingsService: TicketRatingsService) {}

  @Post()
  @Public()
  create(@Body() dto: CreateTicketRatingDto) {
    return this.ticketRatingsService.create(dto);
  }

  @Get('ticket/:ticketId')
  @Public()
  findByTicket(@Param('ticketId') ticketId: string) {
    return this.ticketRatingsService.findByTicketId(ticketId);
  }
}
