import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebsitesController } from './websites.controller';
import { PagesController } from './pages.controller';
import { ThemesController } from './themes.controller';
import { MediaAssetsController } from './media-assets.controller';
import { DomainsController } from './domains.controller';
import { PublicWebsiteController } from './public-website.controller';
import { WebsitesService } from './websites.service';
import { PagesService } from './pages.service';
import { ThemesService } from './themes.service';
import { MediaAssetsService } from './media-assets.service';
import { PublishingService } from './publishing.service';
import { DomainsService } from './domains.service';
import { DomainVerificationProcessor } from './domain-verification.processor';
import { QUEUE_DOMAIN_VERIFICATION } from '../queue/queue.constants';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_DOMAIN_VERIFICATION,
    }),
    StorageModule,
  ],
  controllers: [
    WebsitesController,
    PagesController,
    ThemesController,
    MediaAssetsController,
    DomainsController,
    PublicWebsiteController,
  ],
  providers: [
    WebsitesService,
    PagesService,
    ThemesService,
    MediaAssetsService,
    PublishingService,
    DomainsService,
    DomainVerificationProcessor,
  ],
  exports: [
    WebsitesService,
    PagesService,
    ThemesService,
    MediaAssetsService,
    PublishingService,
    DomainsService,
  ],
})
export class WebsiteBuilderModule {}
