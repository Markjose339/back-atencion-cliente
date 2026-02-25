import { Public } from '@/auth/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { SignQzRequestDto } from './dto/sign-qz-request.dto';
import { QzService } from './qz.service';

@Controller('qz')
@Public()
export class QzController {
  constructor(private readonly qzService: QzService) {}

  @Get('cert')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async getCertificate(): Promise<string> {
    return this.qzService.getCertificate();
  }

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  async sign(@Body() body: SignQzRequestDto): Promise<{ signature: string }> {
    const signature = await this.qzService.sign(body.data);
    return { signature };
  }
}
