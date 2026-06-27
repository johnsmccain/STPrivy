import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { VeriffService, VeriffWebhookPayload } from './veriff.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('veriff')
export class VeriffController {
  constructor(private readonly veriffService: VeriffService) {}

  /** POST /veriff/session — create a Veriff session for the authenticated user */
  @Post('session')
  @UseGuards(JwtAuthGuard)
  async createSession(@CurrentUser() user: AuthenticatedUser) {
    return this.veriffService.createSession(user.userId);
  }

  /** GET /veriff/session/:sessionId — poll session status */
  @Get('session/:sessionId')
  @UseGuards(JwtAuthGuard)
  async getSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.veriffService.getSession(sessionId, user.userId);
  }

  /** POST /veriff/webhook — receive Veriff decision callbacks */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Body() payload: VeriffWebhookPayload,
    @Headers('x-hmac-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(payload);
    await this.veriffService.handleWebhook(payload, signature ?? '', rawBody);
    return { received: true };
  }
}
