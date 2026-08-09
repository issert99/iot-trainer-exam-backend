import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ClientType } from '../../users/user.types';

export class LoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;

  /** 客户端类型：web 管理端 / app 移动端，默认 web */
  @IsOptional()
  @IsIn(['web', 'app'])
  clientType?: ClientType = 'web';
}
