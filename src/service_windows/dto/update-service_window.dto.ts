import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceWindowDto } from './create-service_window.dto';

export class UpdateServiceWindowDto extends PartialType(CreateServiceWindowDto) {}
