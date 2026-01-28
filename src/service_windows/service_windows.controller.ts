import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ServiceWindowsService } from './service_windows.service';
import { CreateServiceWindowDto } from './dto/create-service_window.dto';
import { UpdateServiceWindowDto } from './dto/update-service_window.dto';
import { PaginationDto } from '@/pagination/dto/pagination.dto';

@Controller('service-windows')
export class ServiceWindowsController {
  constructor(private readonly serviceWindowsService: ServiceWindowsService) {}

  @Post()
  create(@Body() createServiceWindowDto: CreateServiceWindowDto) {
    return this.serviceWindowsService.create(createServiceWindowDto);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.serviceWindowsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceWindowsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateServiceWindowDto: UpdateServiceWindowDto,
  ) {
    return this.serviceWindowsService.update(id, updateServiceWindowDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.serviceWindowsService.remove(id);
  }
}
