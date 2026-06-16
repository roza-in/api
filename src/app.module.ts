import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MonitoringInterceptor } from './common/interceptors/monitoring.interceptor';
import { validate } from './config/env.validation';
import { PrismaModule } from './modules/prisma/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { BullBoardModule } from './modules/queue/bull-board.module';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessModule } from './modules/business/business.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ServicesModule } from './modules/services/services.module';
import { StaffModule } from './modules/staff/staff.module';
import { CustomersModule } from './modules/customers/customers.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebsiteBuilderModule } from './modules/website-builder/website-builder.module';
import { BookingModule } from './modules/booking/booking.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { AdminModule } from './modules/admin/admin.module';
import { ComplianceModule } from './modules/compliance/compliance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    StorageModule,
    QueueModule,
    BullBoardModule,
    AuthModule,
    BusinessModule,
    PermissionsModule,
    ServicesModule,
    StaffModule,
    CustomersModule,
    AppointmentsModule,
    PaymentsModule,
    WebhooksModule,
    SubscriptionsModule,
    NotificationsModule,
    WebsiteBuilderModule,
    BookingModule,
    AnalyticsModule,
    MarketingModule,
    AdminModule,
    ComplianceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MonitoringInterceptor,
    },
  ],
})
export class AppModule {}
