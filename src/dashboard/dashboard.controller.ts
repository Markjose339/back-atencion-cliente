import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import type {
  DashboardAreaResponse,
  DashboardBranchPerformanceResponse,
  DashboardPanelResponse,
  DashboardServicePerformanceResponse,
  DashboardSummaryResponse,
  DashboardWindowPerformanceResponse,
} from './dto/dashboard-response.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('panel')
  getPanel(): Promise<DashboardPanelResponse> {
    return this.dashboardService.getPanel();
  }

  @Get('summary')
  getSummary(): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary();
  }

  @Get('tickets-area')
  getArea(): Promise<DashboardAreaResponse> {
    return this.dashboardService.getArea();
  }

  @Get('branches-performance')
  getBranchesPerformance(): Promise<DashboardBranchPerformanceResponse> {
    return this.dashboardService.getBranchesPerformance();
  }

  @Get('windows-performance')
  getWindowsPerformance(): Promise<DashboardWindowPerformanceResponse> {
    return this.dashboardService.getWindowsPerformance();
  }

  @Get('services-performance')
  getServicesPerformance(): Promise<DashboardServicePerformanceResponse> {
    return this.dashboardService.getServicesPerformance();
  }
}
