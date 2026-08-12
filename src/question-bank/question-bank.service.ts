import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type ComponentNode = {
  children?: ComponentNode[];
  score?: number;
  type?: string;
};

type TemplateScope = {
  collegeId: null | string;
  majorId: null | string;
  scope: 'college' | 'course' | 'major' | 'private' | 'public';
};

@Injectable()
export class QuestionBankService {
  constructor(private readonly db: DatabaseService) {}

  private async withPaging(
    query: Record<string, string>,
    params: unknown[],
    dataSql: string,
  ) {
    const page = Number(query.page);
    const pageSize = Number(query.pageSize);
    const usePage =
      Number.isFinite(page) &&
      page > 0 &&
      Number.isFinite(pageSize) &&
      pageSize > 0;

    if (!usePage) {
      const rows = await this.db.query(dataSql, params);
      return rows.rows;
    }

    const countResult = await this.db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM (${dataSql}) AS _cnt`,
      params,
    );
    const total = countResult.rows[0]?.total ?? 0;
    const offset = (page - 1) * pageSize;
    const rows = await this.db.query(
      `${dataSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    return { items: rows.rows, total };
  }

  private sumScore(components: ComponentNode[]): number {
    let total = 0;
    for (const node of components || []) {
      total += Number(node.score || 0);
      if (Array.isArray(node.children) && node.children.length) {
        total += this.sumScore(node.children);
      }
    }
    return total;
  }

  private primaryType(components: ComponentNode[]): string {
    const walk = (list: ComponentNode[]): string | undefined => {
      for (const node of list || []) {
        if (node.type && node.type !== 'rich_stem' && node.type !== 'group') {
          return String(node.type);
        }
        if (node.children?.length) {
          const hit = walk(node.children);
          if (hit) return hit;
        }
      }
      return undefined;
    };
    return walk(components) || 'composite';
  }

  private resolveTemplateScope(rawScope?: string): TemplateScope {
    const raw = String(rawScope || 'public').trim();
    if (raw.startsWith('college:')) {
      const collegeId = raw.slice('college:'.length);
      if (!collegeId) throw new BadRequestException('请选择模板所属学院');
      return { scope: 'college', collegeId, majorId: null };
    }
    if (raw.startsWith('major:')) {
      const majorId = raw.slice('major:'.length);
      if (!majorId) throw new BadRequestException('请选择模板所属专业');
      return { scope: 'major', collegeId: null, majorId };
    }
    if (raw === 'course' || raw === 'private' || raw === 'major') {
      return { scope: raw, collegeId: null, majorId: null };
    }
    return { scope: 'public', collegeId: null, majorId: null };
  }

  private templateScopeSql(alias = 't') {
    return `CASE
      WHEN ${alias}.scope = 'college' AND ${alias}.college_id IS NOT NULL
        THEN 'college:' || ${alias}.college_id::text
      WHEN ${alias}.scope = 'major' AND ${alias}.major_id IS NOT NULL
        THEN 'major:' || ${alias}.major_id::text
      ELSE ${alias}.scope
    END`;
  }

  async ensureSchema() {
    await this.db.query(`
      ALTER TABLE question_templates
        ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE question_templates
        ADD COLUMN IF NOT EXISTS college_id UUID REFERENCES colleges(id);
      ALTER TABLE question_templates
        DROP CONSTRAINT IF EXISTS question_templates_scope_check;
      ALTER TABLE question_templates
        ADD CONSTRAINT question_templates_scope_check
        CHECK (scope IN ('public','college','major','course','private'));
      CREATE INDEX IF NOT EXISTS idx_qtemplates_college
        ON question_templates(college_id)
    `);
  }

  async listCourses() {
    const result = await this.db.query<{
      id: string;
      name: string;
      major_id: string;
      major_name: string;
    }>(
      `SELECT c.id, c.name, c.major_id, m.name AS major_name
       FROM courses c
       JOIN majors m ON m.id = c.major_id
       WHERE c.is_active = TRUE
       ORDER BY m.sort_order, c.sort_order, c.name`,
    );
    return result.rows;
  }

  async listTemplates(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const params = [keyword, `%${keyword}%`];
    const dataSql = `
      SELECT t.id, t.name, t.description, t.type,
             ${this.templateScopeSql('t')} AS scope, t.components,
             t.default_score, t.usage_count, t.is_active,
             to_char(t.updated_at, 'YYYY-MM-DD') AS updated_at,
             CASE
               WHEN jsonb_typeof(COALESCE(t.components, '[]'::jsonb)) = 'array'
                 THEN jsonb_array_length(COALESCE(t.components, '[]'::jsonb))
               WHEN t.components IS NULL THEN 0
               ELSE 1
             END AS component_count
      FROM question_templates t
      WHERE t.is_active = TRUE
        AND ($1 = '' OR t.name ILIKE $2 OR COALESCE(t.description, '') ILIKE $2)
      ORDER BY t.updated_at DESC, t.name`;
    return this.withPaging(query, params, dataSql);
  }

  async getTemplate(id: string) {
    const result = await this.db.query(
      `SELECT t.id, t.name, t.description, t.type,
              ${this.templateScopeSql('t')} AS scope, t.components,
              t.default_score, t.usage_count, t.is_active,
              to_char(t.updated_at, 'YYYY-MM-DD') AS updated_at
       FROM question_templates t
       WHERE t.id = $1 AND t.is_active = TRUE`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('模板不存在');
    return result.rows[0];
  }

  async createTemplate(
    body: {
      name?: string;
      description?: string;
      components?: unknown[];
      scope?: string;
    },
    userId?: string,
  ) {
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('模板名称不能为空');
    const components = Array.isArray(body.components) ? body.components : [];
    if (components.length === 0) {
      throw new BadRequestException('请至少添加一个组件');
    }
    const type = this.primaryType(components as ComponentNode[]);
    const defaultScore = this.sumScore(components as ComponentNode[]);
    const templateScope = this.resolveTemplateScope(body.scope);
    const result = await this.db.query(
      `INSERT INTO question_templates
         (name, type, scope, college_id, major_id, description,
          default_score, components, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING id`,
      [
        name,
        type,
        templateScope.scope,
        templateScope.collegeId,
        templateScope.majorId,
        String(body.description || '').trim() || null,
        defaultScore,
        JSON.stringify(components),
        userId || null,
      ],
    );
    return this.getTemplate(result.rows[0].id);
  }

  async updateTemplate(
    id: string,
    body: {
      name?: string;
      description?: string;
      components?: unknown[];
      scope?: string;
    },
  ) {
    await this.getTemplate(id);
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('模板名称不能为空');
    const components = Array.isArray(body.components) ? body.components : [];
    if (components.length === 0) {
      throw new BadRequestException('请至少添加一个组件');
    }
    const type = this.primaryType(components as ComponentNode[]);
    const defaultScore = this.sumScore(components as ComponentNode[]);
    const templateScope = this.resolveTemplateScope(body.scope);
    await this.db.query(
      `UPDATE question_templates
       SET name = $2,
           type = $3,
           scope = $4,
           college_id = $5,
           major_id = $6,
           course_id = NULL,
           description = $7,
           default_score = $8,
           components = $9::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        name,
        type,
        templateScope.scope,
        templateScope.collegeId,
        templateScope.majorId,
        String(body.description || '').trim() || null,
        defaultScore,
        JSON.stringify(components),
      ],
    );
    return this.getTemplate(id);
  }

  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    const used = await this.db.query(
      `SELECT 1 FROM questions WHERE template_id = $1 LIMIT 1`,
      [id],
    );
    if (used.rows.length) {
      // 软删除，保留已被引用的模板记录
      await this.db.query(
        `UPDATE question_templates SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [id],
      );
      return { softDeleted: true };
    }
    await this.db.query(`DELETE FROM question_templates WHERE id = $1`, [id]);
    return { softDeleted: false };
  }

  async listQuestions(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const courseId = (query.courseId || '').trim();
    const status = (query.status || '').trim();
    const params: unknown[] = [keyword, `%${keyword}%`, courseId, status];
    const dataSql = `
      SELECT q.id, q.title, q.course_id, c.name AS course_name,
             q.template_id, t.name AS template_name,
             q.components, q.status, q.score, q.difficulty, q.type,
             to_char(q.updated_at, 'YYYY-MM-DD') AS updated_at
      FROM questions q
      JOIN courses c ON c.id = q.course_id
      LEFT JOIN question_templates t ON t.id = q.template_id
      WHERE ($1 = '' OR q.title ILIKE $2)
        AND ($3 = '' OR q.course_id::text = $3)
        AND ($4 = '' OR q.status = $4)
      ORDER BY q.updated_at DESC, q.created_at DESC`;
    return this.withPaging(query, params, dataSql);
  }

  async getQuestion(id: string) {
    const result = await this.db.query(
      `SELECT q.id, q.title, q.course_id, c.name AS course_name,
              q.major_id, q.template_id, t.name AS template_name,
              q.components, q.status, q.score, q.difficulty, q.type, q.bank_type,
              to_char(q.updated_at, 'YYYY-MM-DD') AS updated_at
       FROM questions q
       JOIN courses c ON c.id = q.course_id
       LEFT JOIN question_templates t ON t.id = q.template_id
       WHERE q.id = $1`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('题目不存在');
    return result.rows[0];
  }

  private async resolveCourse(courseId: string) {
    const result = await this.db.query<{ id: string; major_id: string; name: string }>(
      `SELECT id, major_id, name FROM courses WHERE id = $1 AND is_active = TRUE`,
      [courseId],
    );
    if (!result.rows[0]) throw new BadRequestException('课程不存在');
    return result.rows[0];
  }

  async createQuestion(
    body: {
      title?: string;
      courseId?: string;
      templateId?: string;
      components?: unknown[];
      status?: string;
      difficulty?: number;
      bankType?: string;
    },
    userId?: string,
  ) {
    const title = String(body.title || '').trim();
    const courseId = String(body.courseId || '').trim();
    if (!title) throw new BadRequestException('题目标题不能为空');
    if (!courseId) throw new BadRequestException('请选择课程');
    const components = Array.isArray(body.components) ? body.components : [];
    if (components.length === 0) {
      throw new BadRequestException('请至少添加一个组件');
    }
    const course = await this.resolveCourse(courseId);
    const type = this.primaryType(components as ComponentNode[]);
    const score = this.sumScore(components as ComponentNode[]) || 2;
    const difficulty = Number(body.difficulty);
    const safeDifficulty =
      Number.isFinite(difficulty) && difficulty >= 1 && difficulty <= 5
        ? difficulty
        : 3;
    const status = ['draft', 'published', 'archived'].includes(
      String(body.status || ''),
    )
      ? String(body.status)
      : 'draft';
    const bankType = ['exam', 'practice', 'both'].includes(
      String(body.bankType || ''),
    )
      ? String(body.bankType)
      : 'exam';

    let templateId: string | null = body.templateId || null;
    if (templateId) {
      const tpl = await this.db.query(
        `SELECT id FROM question_templates WHERE id = $1 AND is_active = TRUE`,
        [templateId],
      );
      if (!tpl.rows[0]) templateId = null;
      else {
        await this.db.query(
          `UPDATE question_templates SET usage_count = usage_count + 1 WHERE id = $1`,
          [templateId],
        );
      }
    }

    const result = await this.db.query(
      `INSERT INTO questions
         (template_id, major_id, course_id, type, difficulty, score, title,
          components, bank_type, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
       RETURNING id`,
      [
        templateId,
        course.major_id,
        course.id,
        type,
        safeDifficulty,
        score,
        title,
        JSON.stringify(components),
        bankType,
        status,
        userId || null,
      ],
    );
    return this.getQuestion(result.rows[0].id);
  }

  async updateQuestion(
    id: string,
    body: {
      title?: string;
      courseId?: string;
      templateId?: string | null;
      components?: unknown[];
      status?: string;
      difficulty?: number;
      bankType?: string;
    },
  ) {
    await this.getQuestion(id);
    const title = String(body.title || '').trim();
    const courseId = String(body.courseId || '').trim();
    if (!title) throw new BadRequestException('题目标题不能为空');
    if (!courseId) throw new BadRequestException('请选择课程');
    const components = Array.isArray(body.components) ? body.components : [];
    if (components.length === 0) {
      throw new BadRequestException('请至少添加一个组件');
    }
    const course = await this.resolveCourse(courseId);
    const type = this.primaryType(components as ComponentNode[]);
    const score = this.sumScore(components as ComponentNode[]) || 2;
    const difficulty = Number(body.difficulty);
    const safeDifficulty =
      Number.isFinite(difficulty) && difficulty >= 1 && difficulty <= 5
        ? difficulty
        : 3;
    const status = ['draft', 'published', 'archived'].includes(
      String(body.status || ''),
    )
      ? String(body.status)
      : 'draft';
    const bankType = ['exam', 'practice', 'both'].includes(
      String(body.bankType || ''),
    )
      ? String(body.bankType)
      : 'exam';

    let templateId: string | null =
      body.templateId === null || body.templateId === undefined
        ? null
        : String(body.templateId);

    await this.db.query(
      `UPDATE questions
       SET template_id = $2,
           major_id = $3,
           course_id = $4,
           type = $5,
           difficulty = $6,
           score = $7,
           title = $8,
           components = $9::jsonb,
           bank_type = $10,
           status = $11,
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        templateId,
        course.major_id,
        course.id,
        type,
        safeDifficulty,
        score,
        title,
        JSON.stringify(components),
        bankType,
        status,
      ],
    );
    return this.getQuestion(id);
  }

  async deleteQuestion(id: string) {
    await this.getQuestion(id);
    await this.db.query(`DELETE FROM questions WHERE id = $1`, [id]);
    return true;
  }

  async batchDeleteQuestions(ids: string[]) {
    const list = (ids || []).filter(Boolean);
    if (!list.length) throw new BadRequestException('请选择要删除的题目');
    await this.db.query(`DELETE FROM questions WHERE id = ANY($1::uuid[])`, [
      list,
    ]);
    return true;
  }

  async seedDemoTemplates(userId?: string) {
    const count = await this.db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM question_templates WHERE is_active = TRUE`,
    );
    if ((count.rows[0]?.total || 0) > 0) {
      return { seeded: false, message: '已有模板，跳过' };
    }

    const demos = [
      {
        name: '阅读理解',
        description: '材料题干 + 小题容器（内含多道单选）',
        components: [
          {
            id: 'c1',
            type: 'rich_stem',
            label: '阅读材料',
            score: 0,
            judgeMode: 'none',
            config: {
              html: '在此粘贴英文文章，可插入配图。',
              allowImage: true,
              allowAttachment: true,
            },
          },
          {
            id: 'c2',
            type: 'group',
            label: '阅读小题',
            score: 0,
            judgeMode: 'none',
            config: { sharedStem: true },
            children: [
              {
                id: 'c2a',
                type: 'option_group',
                label: '小题 1',
                score: 2,
                judgeMode: 'auto',
                config: {
                  mode: 'single',
                  options: [
                    { key: 'A', text: '选项 A' },
                    { key: 'B', text: '选项 B' },
                    { key: 'C', text: '选项 C' },
                    { key: 'D', text: '选项 D' },
                  ],
                  answer: ['A'],
                },
              },
            ],
          },
        ],
      },
      {
        name: '网络拓扑连线',
        description: '说明 + 拓扑画布',
        components: [
          {
            id: 'c1',
            type: 'rich_stem',
            label: '题目说明',
            score: 0,
            judgeMode: 'none',
            config: {
              html: '根据拓扑要求，在画布上完成设备连线。',
              allowImage: true,
              allowAttachment: true,
            },
          },
          {
            id: 'c2',
            type: 'canvas',
            label: '拓扑连线区',
            score: 10,
            judgeMode: 'manual',
            config: {
              mode: 'topology',
              backgroundImage: '',
              tools: ['line', 'node', 'text'],
            },
          },
        ],
      },
      {
        name: '编程题',
        description: '题干 + 代码编辑器',
        components: [
          {
            id: 'c1',
            type: 'rich_stem',
            label: '题目描述',
            score: 0,
            judgeMode: 'none',
            config: {
              html: '请实现指定算法。',
              allowImage: true,
              allowAttachment: false,
            },
          },
          {
            id: 'c2',
            type: 'code_editor',
            label: '代码作答',
            score: 15,
            judgeMode: 'auto',
            config: {
              languages: ['python', 'c', 'java'],
              defaultLanguage: 'python',
              starterCode: '',
              testCases: '',
            },
          },
        ],
      },
    ];

    for (const demo of demos) {
      await this.createTemplate(demo, userId);
    }
    return { seeded: true, count: demos.length };
  }
}
