import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicService } from './public.service';
import { Public } from '@/auth/decorators/public.decorator';
import { DisplayCallsQueryDto } from './dto/display-calls-query.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('branches')
  @Public()
  getBranches() {
    return this.publicService.getBranches();
  }

  @Get('branches/:branchId/services')
  @Public()
  getServicesByBranch(@Param('branchId') branchId: string) {
    return this.publicService.getServicesByBranch(branchId);
  }

  @Get('display/calls')
  @Public()
  getDisplayCalls(@Query() query: DisplayCallsQueryDto) {
    return this.publicService.getDisplayCalls(query.branchId, query.serviceIds);
  }
}
