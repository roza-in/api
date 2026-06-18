import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Business')
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('check-slug/:slug')
  @ApiOperation({
    summary: 'Check if a business slug is available',
  })
  @ApiResponse({
    status: 200,
    description: 'Slug availability status returned',
  })
  async checkSlug(@Param('slug') slug: string) {
    const isAvailable = await this.businessService.isSlugAvailable(slug);
    return { available: isAvailable };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register a new business with default branch (onboarding)',
  })
  @ApiResponse({
    status: 201,
    description: 'Business created, new JWT tokens returned',
  })
  @ApiResponse({ status: 409, description: 'Slug already taken' })
  async register(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateBusinessDto,
  ) {
    return this.businessService.registerBusiness(user.userId, user.email, dto);
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current business details with branches and counts',
  })
  @ApiResponse({ status: 200, description: 'Business details returned' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getCurrent(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.businessService.findCurrent(user.businessId);
  }

  @Patch('current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current business settings' })
  @ApiResponse({ status: 200, description: 'Business updated' })
  @ApiResponse({
    status: 409,
    description: 'Version conflict — record was modified by another user',
  })
  async updateCurrent(
    @CurrentUser() user: UserPayload,
    @Body() dto: UpdateBusinessDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.businessService.update(user.businessId, user.userId, dto);
  }

  @Delete('current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete current business (Owner only)' })
  @ApiResponse({ status: 200, description: 'Business deleted' })
  async deleteCurrent(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.businessService.softDelete(user.businessId, user.userId);
  }
}
