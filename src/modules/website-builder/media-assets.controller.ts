import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaAssetsService } from './media-assets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

interface UploadedFileDto {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('Websites Media Assets')
@Controller('websites/media-assets')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
@Permissions('website:manage')
export class MediaAssetsController {
  constructor(private readonly mediaAssetsService: MediaAssetsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a media asset (image) to store in S3' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        altText: {
          type: 'string',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Media asset uploaded and registered',
  })
  async upload(
    @CurrentUser() user: UserPayload,
    @UploadedFile() file: UploadedFileDto,
    @Body('altText') altText?: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }

    if (!file) {
      throw new BadRequestException('File is required');
    }

    // File validation: maximum 10MB as per architecture standards, supported image formats only
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('File size exceeds the 10MB limit');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file format. Use JPG, PNG, or WEBP.',
      );
    }

    return this.mediaAssetsService.upload(
      user.businessId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      altText,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all media assets uploaded by the business' })
  @ApiResponse({ status: 200, description: 'List of media assets' })
  async findAll(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.mediaAssetsService.findAll(user.businessId);
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove/delete a media asset' })
  @ApiResponse({ status: 204, description: 'Media asset deleted successfully' })
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    await this.mediaAssetsService.remove(user.businessId, assetId);
  }
}
