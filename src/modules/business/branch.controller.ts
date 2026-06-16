import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
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
import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Branches')
@Controller('businesses/branches')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @Permissions('branch:create')
  @ApiOperation({ summary: 'Create a new branch for the current business' })
  @ApiResponse({ status: 201, description: 'Branch created' })
  async create(@CurrentUser() user: UserPayload, @Body() dto: CreateBranchDto) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.branchService.create(user.businessId, user.userId, dto);
  }

  @Get()
  @Permissions('branch:read')
  @ApiOperation({ summary: 'List all branches for the current business' })
  @ApiResponse({ status: 200, description: 'List of branches returned' })
  async findAll(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.branchService.findAll(user.businessId);
  }

  @Get(':id')
  @Permissions('branch:read')
  @ApiOperation({ summary: 'Get a branch by ID' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiResponse({ status: 200, description: 'Branch returned' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.branchService.findOne(user.businessId, id);
  }

  @Patch(':id')
  @Permissions('branch:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a branch' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiResponse({ status: 200, description: 'Branch updated' })
  @ApiResponse({ status: 409, description: 'Version conflict' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.branchService.update(user.businessId, user.userId, id, dto);
  }

  @Delete(':id')
  @Permissions('branch:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a branch (cannot delete last branch)' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiResponse({ status: 200, description: 'Branch deleted' })
  @ApiResponse({ status: 409, description: 'Cannot delete last branch' })
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException(
        'No business context — create a business first',
      );
    }
    return this.branchService.softDelete(user.businessId, user.userId, id);
  }
}
