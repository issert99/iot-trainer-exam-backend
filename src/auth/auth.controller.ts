import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiResponse } from '../common/dto/api-response';
import { PublicUser } from '../users/user.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 统一登录接口（Web / App）
   * POST /api/auth/login
   */
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;
    const data = await this.authService.login(dto, ip);
    return ApiResponse.ok(data, '登录成功');
  }

  /**
   * 获取当前登录用户
   * GET /api/auth/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: PublicUser) {
    const profile = await this.authService.getProfile(user.id);
    return ApiResponse.ok(profile);
  }
}
