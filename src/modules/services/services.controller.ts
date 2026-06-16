import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Services')
@Controller('businesses/services')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // --- Category Endpoints ---

  @Post('categories')
  @Permissions('service:create')
  @ApiOperation({ summary: 'Create a new service category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async createCategory(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateCategoryDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.createCategory(
      user.businessId,
      user.userId,
      dto,
    );
  }

  @Get('categories')
  @Permissions('service:read')
  @ApiOperation({ summary: 'List all service categories' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  async findAllCategories(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.findAllCategories(user.businessId);
  }

  @Get('categories/:id')
  @Permissions('service:read')
  @ApiOperation({ summary: 'Get a service category by ID' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category returned' })
  async findOneCategory(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.findOneCategory(user.businessId, id);
  }

  @Patch('categories/:id')
  @Permissions('service:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a service category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.updateCategory(
      user.businessId,
      user.userId,
      id,
      dto,
    );
  }

  @Delete('categories/:id')
  @Permissions('service:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a service category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async removeCategory(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.softDeleteCategory(
      user.businessId,
      user.userId,
      id,
    );
  }

  // --- Service Endpoints ---

  @Post()
  @Permissions('service:create')
  @ApiOperation({
    summary: 'Create a new service with optional staff linkages',
  })
  @ApiResponse({ status: 201, description: 'Service created' })
  async createService(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateServiceDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.createService(
      user.businessId,
      user.userId,
      dto,
    );
  }

  @Get()
  @Permissions('service:read')
  @ApiOperation({
    summary: 'List all services, optionally filtered by category',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Category UUID to filter',
  })
  @ApiResponse({ status: 200, description: 'List of services' })
  async findAllServices(
    @CurrentUser() user: UserPayload,
    @Query('categoryId') categoryId?: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.findAllServices(user.businessId, categoryId);
  }

  @Get(':id')
  @Permissions('service:read')
  @ApiOperation({ summary: 'Get service details by ID' })
  @ApiParam({ name: 'id', description: 'Service UUID' })
  @ApiResponse({ status: 200, description: 'Service details' })
  async findOneService(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.findOneService(user.businessId, id);
  }

  @Patch(':id')
  @Permissions('service:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a service and its staff linkages' })
  @ApiParam({ name: 'id', description: 'Service UUID' })
  @ApiResponse({ status: 200, description: 'Service updated' })
  async updateService(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.updateService(
      user.businessId,
      user.userId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @Permissions('service:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a service and clear its staff linkages' })
  @ApiParam({ name: 'id', description: 'Service UUID' })
  @ApiResponse({ status: 200, description: 'Service deleted' })
  async removeService(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.servicesService.softDeleteService(
      user.businessId,
      user.userId,
      id,
    );
  }
}
