import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query() query: FindAuditLogsQueryDto) {
    return this.auditService.findAll(query);
  }

  @Get('catalog/actions')
  getActionsCatalog() {
    return this.auditService.getActionsCatalog();
  }

  @Get('catalog/auditable-types')
  getAuditableTypesCatalog() {
    return this.auditService.getAuditableTypesCatalog();
  }

  @Get('catalog/users')
  getUsersCatalog() {
    return this.auditService.getUsersCatalog();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auditService.findOne(id);
  }
}
