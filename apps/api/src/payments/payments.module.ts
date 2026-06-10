import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsWorker } from './payments.worker';
import { PaypalClient } from './paypal.client';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [AuthModule],
  controllers: [WebhookController, PaymentsController],
  providers: [PaypalClient, PaymentsService, PaymentsWorker],
  exports: [PaymentsService],
})
export class PaymentsModule {}
