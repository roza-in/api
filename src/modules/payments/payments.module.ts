import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentAdapterFactory } from './payment-adapter.factory';
import { EncryptionService } from '../../common/utils/encryption.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentAdapterFactory, EncryptionService],
  exports: [PaymentsService, PaymentAdapterFactory, EncryptionService],
})
export class PaymentsModule {}
