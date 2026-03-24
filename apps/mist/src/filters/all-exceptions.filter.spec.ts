import { Test, TestingModule } from '@nestjs/testing';
import { AllExceptionsFilter } from './all-exceptions.filter';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Response } from 'express';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: jest.Mocked<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle BadRequestException', () => {
    const exception = new BadRequestException('Invalid parameter');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
      }),
    );
  });

  it('should handle NotFoundException', () => {
    const exception = new NotFoundException('Resource not found');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 404,
      }),
    );
  });

  it('should handle UnauthorizedException', () => {
    const exception = new UnauthorizedException('Unauthorized');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 401,
      }),
    );
  });

  it('should handle ForbiddenException', () => {
    const exception = new ForbiddenException('Forbidden');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 403,
      }),
    );
  });

  it('should handle ConflictException', () => {
    const exception = new ConflictException('Conflict');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 409,
      }),
    );
  });

  it('should handle QueryFailedError', () => {
    const exception = { name: 'QueryFailedError', message: 'Database error' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
      }),
    );
  });

  it('should handle unknown exceptions', () => {
    const exception = new Error('Unknown error');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
      }),
    );
  });

  it('should include timestamp and requestId', () => {
    const exception = new BadRequestException('Test');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
        requestId: expect.stringMatching(/^err-/),
      }),
    );
  });
});
