import { PartialType } from '@nestjs/mapped-types';
import { CreateWindowDto } from './create-window.dto';

export class UpdateWindowDto extends PartialType(CreateWindowDto) {}
