import {
  Body,
  Controller,
  Delete,
  Get,
  OnModuleInit,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '../common/dto/api-response';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PublicUser } from '../users/user.types';
import { QuestionBankService } from './question-bank.service';

@Controller('question-bank')
@UseGuards(JwtAuthGuard)
export class QuestionBankController implements OnModuleInit {
  constructor(private readonly questionBankService: QuestionBankService) {}

  async onModuleInit() {
    await this.questionBankService.ensureSchema();
    await this.questionBankService.seedDemoTemplates();
  }

  @Get('courses')
  async courses() {
    return ApiResponse.ok(await this.questionBankService.listCourses());
  }

  @Get('templates')
  async listTemplates(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.questionBankService.listTemplates(query));
  }

  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    return ApiResponse.ok(await this.questionBankService.getTemplate(id));
  }

  @Post('templates')
  async createTemplate(
    @Body() body: Record<string, any>,
    @CurrentUser() user: PublicUser,
  ) {
    return ApiResponse.ok(
      await this.questionBankService.createTemplate(body, user.id),
      '模板已创建',
    );
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return ApiResponse.ok(
      await this.questionBankService.updateTemplate(id, body),
      '模板已更新',
    );
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    return ApiResponse.ok(
      await this.questionBankService.deleteTemplate(id),
      '模板已删除',
    );
  }

  @Get('questions')
  async listQuestions(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.questionBankService.listQuestions(query));
  }

  @Get('questions/:id')
  async getQuestion(@Param('id') id: string) {
    return ApiResponse.ok(await this.questionBankService.getQuestion(id));
  }

  @Post('questions')
  async createQuestion(
    @Body() body: Record<string, any>,
    @CurrentUser() user: PublicUser,
  ) {
    return ApiResponse.ok(
      await this.questionBankService.createQuestion(body, user.id),
      '题目已创建',
    );
  }

  @Put('questions/:id')
  async updateQuestion(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return ApiResponse.ok(
      await this.questionBankService.updateQuestion(id, body),
      '题目已更新',
    );
  }

  @Delete('questions/:id')
  async deleteQuestion(@Param('id') id: string) {
    return ApiResponse.ok(
      await this.questionBankService.deleteQuestion(id),
      '题目已删除',
    );
  }

  @Post('questions/batch-delete')
  async batchDeleteQuestions(@Body() body: { ids?: string[] }) {
    return ApiResponse.ok(
      await this.questionBankService.batchDeleteQuestions(body.ids || []),
      '批量删除成功',
    );
  }
}
