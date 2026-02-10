import { Controller, Get, Param } from '@nestjs/common';
import { PublicService } from './public.service';
import { Public } from '@/auth/decorators/public.decorator';

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
}
