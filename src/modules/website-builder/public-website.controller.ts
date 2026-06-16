import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WebsitesService } from './websites.service';
import type { Response } from 'express';

@ApiTags('Public Website Assets')
@Controller('websites/public')
export class PublicWebsiteController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get(':slug/sitemap.xml')
  @ApiOperation({ summary: 'Generate public sitemap.xml dynamically' })
  @ApiResponse({ status: 200, description: 'Returns the XML sitemap' })
  async getSitemap(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const xml = await this.websitesService.generateSitemap(slug);
    res.set('Content-Type', 'text/xml');
    res.status(200).send(xml);
  }

  @Get(':slug/robots.txt')
  @ApiOperation({ summary: 'Generate public robots.txt dynamically' })
  @ApiResponse({
    status: 200,
    description: 'Returns the plain text robots.txt',
  })
  async getRobots(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const text = await this.websitesService.generateRobots(slug);
    res.set('Content-Type', 'text/plain');
    res.status(200).send(text);
  }
}
