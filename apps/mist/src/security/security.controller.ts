import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { Security } from '@app/shared-data';
import { SecurityService } from './security.service';
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
import { DeleteSecuritySourceDto } from './dto/delete-security-source.dto';

@ApiTags('security v1')
@Controller('security/v1')
@UseFilters(AllExceptionsFilter)
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('initialize')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize a new security' })
  @ApiResponse({
    status: 201,
    description: 'Security successfully initialized',
    type: Security,
  })
  @ApiResponse({ status: 409, description: 'Security already exists' })
  async initializeSecurity(
    @Body() initSecurityDto: InitSecurityDto,
  ): Promise<Security> {
    return await this.securityService.initializeSecurity(initSecurityDto);
  }

  @Post('sources')
  @ApiOperation({
    summary: 'Add or update data source for an existing security',
  })
  @ApiResponse({
    status: 200,
    description: 'Source successfully updated',
    type: Security,
  })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async addSecuritySource(
    @Body() addSecuritySourceDto: AddSecuritySourceDto,
  ): Promise<Security> {
    return await this.securityService.addSecuritySource(addSecuritySourceDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all active securities' })
  @ApiResponse({
    status: 200,
    description: 'List of all active securities',
    type: [Security],
  })
  async getAllSecurities(): Promise<Security[]> {
    return await this.securityService.findAll();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get security by code' })
  @ApiParam({
    name: 'code',
    description: 'Security code (e.g., 000001.SH, 399006.SZ)',
  })
  @ApiResponse({ status: 200, description: 'Security found', type: Security })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async findSecurityByCode(@Param('code') code: string): Promise<Security> {
    return await this.securityService.findSecurityByCode(code);
  }

  @Put(':code/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a security' })
  @ApiParam({ name: 'code', description: 'Security code to deactivate' })
  @ApiResponse({
    status: 200,
    description: 'Security successfully deactivated',
  })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async deactivateSecurity(@Param('code') code: string): Promise<void> {
    await this.securityService.deactivateSecurity(code);
  }

  @Put(':code/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a deactivated security' })
  @ApiParam({ name: 'code', description: 'Security code to activate' })
  @ApiResponse({ status: 200, description: 'Security successfully activated' })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async activateSecurity(@Param('code') code: string): Promise<void> {
    await this.securityService.activateSecurity(code);
  }

  @Delete('sources')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a security source configuration' })
  @ApiResponse({ status: 200, description: 'Source configuration deleted' })
  @ApiResponse({ status: 404, description: 'Source configuration not found' })
  async deleteSecuritySource(
    @Body() dto: DeleteSecuritySourceDto,
  ): Promise<void> {
    await this.securityService.deleteSecuritySource(dto.id, dto.securityId);
  }

  @Get(':code/sources')
  @ApiOperation({ summary: 'Get source configuration for a security' })
  @ApiParam({ name: 'code', description: 'Security code' })
  @ApiResponse({
    status: 200,
    description: 'Source configuration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async getSecuritySources(@Param('code') code: string) {
    return await this.securityService.getSecuritySources(code);
  }
}
