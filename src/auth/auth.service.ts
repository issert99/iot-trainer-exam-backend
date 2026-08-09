import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import {
  ClientType,
  PublicUser,
  UserRole,
  toPublicUser,
} from '../users/user.types';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  clientType: ClientType;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  clientType: ClientType;
  user: PublicUser;
}

/** 各端允许登录的角色 */
const CLIENT_ROLE_POLICY: Record<ClientType, UserRole[]> = {
  web: ['student', 'teacher', 'admin'],
  app: ['student', 'teacher'],
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto, ip?: string): Promise<LoginResult> {
    const clientType: ClientType = dto.clientType ?? 'web';
    const user = await this.usersService.findByUsername(dto.username.trim());

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordOk) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status === 'locked') {
      throw new ForbiddenException('账号已锁定，请联系管理员');
    }
    if (user.status === 'inactive') {
      throw new ForbiddenException('账号已停用，请联系管理员');
    }

    const allowedRoles = CLIENT_ROLE_POLICY[clientType];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        `当前角色无权从${clientType === 'web' ? 'Web端' : 'App端'}登录`,
      );
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      clientType,
    };

    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '7d');
    const accessToken = await this.jwtService.signAsync(payload);

    await this.usersService.updateLoginMeta(user.id, ip);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      clientType,
      user: toPublicUser(user),
    };
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在或已失效');
    }
    if (user.status !== 'active') {
      throw new ForbiddenException('账号状态异常');
    }
    return toPublicUser(user);
  }
}
