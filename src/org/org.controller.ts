import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '../common/dto/api-response';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgService } from './org.service';

@Controller('org')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get('tree')
  async tree() {
    return ApiResponse.ok(await this.orgService.getTree());
  }

  @Get('options')
  async options() {
    return ApiResponse.ok(await this.orgService.listOptions());
  }

  @Post('node')
  async addNode(
    @Body()
    body: {
      parentType: 'all' | 'college' | 'major';
      parentId?: string;
      name: string;
      code?: string;
    },
  ) {
    return ApiResponse.ok(await this.orgService.addNode(body), '新增节点成功');
  }

  @Delete('node/:type/:id')
  async deleteNode(
    @Param('type') type: 'college' | 'major' | 'class',
    @Param('id') id: string,
  ) {
    await this.orgService.deleteNode(type, id);
    return ApiResponse.ok(true, '删除节点成功');
  }

  @Get('majors')
  async majors(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.orgService.listMajors(query));
  }

  @Get('colleges')
  async colleges(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.orgService.listColleges(query));
  }

  @Get('classes')
  async classes(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.orgService.listClasses(query));
  }

  @Get('students')
  async students(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.orgService.listStudents(query));
  }

  @Get('teachers')
  async teachers(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.orgService.listTeachers(query));
  }

  @Get('courses')
  async courses(@Query() query: Record<string, string>) {
    return ApiResponse.ok(await this.orgService.listCourses(query));
  }

  @Post('create/:tab')
  async create(
    @Param('tab') tab: string,
    @Body() body: Record<string, any>,
  ) {
    return ApiResponse.ok(await this.orgService.createRow(tab, body), '新建成功');
  }

  @Post('import/:tab')
  async importData(
    @Param('tab') tab: string,
    @Body() body: { rows?: Record<string, any>[] },
  ) {
    return ApiResponse.ok(
      await this.orgService.importRows(tab, body.rows || []),
      '导入完成',
    );
  }

  @Get('export/:tab')
  async exportData(
    @Param('tab') tab: string,
    @Query() query: Record<string, string>,
  ) {
    if (tab === 'students') {
      return ApiResponse.ok(await this.orgService.listStudents(query));
    }
    if (tab === 'teachers') {
      return ApiResponse.ok(await this.orgService.listTeachers(query));
    }
    if (tab === 'courses') {
      return ApiResponse.ok(await this.orgService.listCourses(query));
    }
    if (tab === 'classes') {
      return ApiResponse.ok(await this.orgService.listClasses(query));
    }
    if (tab === 'colleges') {
      return ApiResponse.ok(await this.orgService.listColleges(query));
    }
    return ApiResponse.ok(await this.orgService.listMajors(query));
  }

  @Get(':tab/:id/detail')
  async detail(@Param('tab') tab: string, @Param('id') id: string) {
    return ApiResponse.ok(await this.orgService.getDetail(tab, id));
  }

  @Delete(':tab/:id')
  async delete(@Param('tab') tab: string, @Param('id') id: string) {
    await this.orgService.deleteRow(tab, id);
    return ApiResponse.ok(true, '删除成功');
  }

  @Post('batch-delete/:tab')
  async batchDelete(
    @Param('tab') tab: string,
    @Body() body: { ids: string[] },
  ) {
    for (const id of body.ids || []) {
      await this.orgService.deleteRow(tab, id);
    }
    return ApiResponse.ok(true, '批量删除成功');
  }
}
