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
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerSearchDto } from './dto/customer-search.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Customers')
@Controller('businesses/customers')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions('customer:create')
  @ApiOperation({ summary: 'Register a new customer profile' })
  @ApiResponse({ status: 201, description: 'Customer created' })
  async createCustomer(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateCustomerDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.customersService.createCustomer(
      user.businessId,
      user.userId,
      dto,
    );
  }

  @Get()
  @Permissions('customer:read')
  @ApiOperation({ summary: 'List and filter paginated customer profiles' })
  @ApiResponse({ status: 200, description: 'List of customers' })
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query() searchDto: CustomerSearchDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.customersService.findAll(user.businessId, searchDto);
  }

  @Get(':id')
  @Permissions('customer:read')
  @ApiOperation({
    summary: 'Get a specific customer profile with visit history',
  })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({
    status: 200,
    description: 'Customer details with appointments',
  })
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.customersService.findOne(user.businessId, id);
  }

  @Patch(':id')
  @Permissions('customer:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a customer profile' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  async updateCustomer(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.customersService.updateCustomer(
      user.businessId,
      user.userId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @Permissions('customer:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete and anonymize a customer profile' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer deleted' })
  async removeCustomer(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.customersService.softDeleteCustomer(
      user.businessId,
      user.userId,
      id,
    );
  }

  @Post(':id/recalculate-spend')
  @Permissions('customer:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalculate customer spend based on payments' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Spend recalculated' })
  async recalculateSpend(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.customersService.recalculateTotalSpent(user.businessId, id);
  }
}
