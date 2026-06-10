import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthGuard, Public } from '../auth/auth.guard';
import { PaymentsService } from './payments.service';

class ReturnDto {
  @IsString({ message: 'El identificador de la orden es obligatorio.' })
  @IsNotEmpty({ message: 'El identificador de la orden es obligatorio.' })
  token!: string; // PayPal order id from the return URL
}

@Controller('payments/paypal')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Return page support: triggers the capture of the approved order. The real
   * promotion to `active` always arrives via webhook (SPEC §8.4).
   */
  @Public()
  @Post('return')
  @HttpCode(200)
  async paymentReturn(@Body() dto: ReturnDto): Promise<{ ok: true }> {
    await this.payments.captureOnReturn(dto.token);
    return { ok: true };
  }
}
