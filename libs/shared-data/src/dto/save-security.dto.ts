import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { SecurityType, SecurityStatus } from '@app/shared-data';

export class SaveSecurityDto {
  @IsNotEmpty({
    message: '证券代码不能为空',
  })
  @IsString({
    message: '证券代码必须是字符串',
  })
  @MinLength(1, {
    message: '证券代码不能为空',
  })
  @MaxLength(20, {
    message: '证券代码长度不能超过20个字符',
  })
  code!: string;

  @IsNotEmpty({
    message: '证券名称不能为空',
  })
  @IsString({
    message: '证券名称必须是字符串',
  })
  @MinLength(1, {
    message: '证券名称不能为空',
  })
  @MaxLength(100, {
    message: '证券名称长度不能超过100个字符',
  })
  name!: string;

  @IsNotEmpty({
    message: '证券类型不能为空',
  })
  @IsEnum(SecurityType, {
    message: '证券类型只能是 STOCK 或 INDEX',
  })
  type!: SecurityType;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  @IsString({
    message: '交易所必须是字符串',
  })
  @MaxLength(10, {
    message: '交易所代码长度不能超过10个字符',
  })
  exchange!: string;

  @IsOptional()
  @IsEnum(SecurityStatus, {
    message: '状态必须是 ACTIVE、SUSPENDED 或 DELISTED',
  })
  status?: SecurityStatus = SecurityStatus.ACTIVE;
}
