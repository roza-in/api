import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PermissionsService } from './permissions.service';
import { EntitlementsService } from './entitlements.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PermissionsService, EntitlementsService],
  exports: [PermissionsService, EntitlementsService],
})
export class PermissionsModule {}
