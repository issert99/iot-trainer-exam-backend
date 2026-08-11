import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class OrgService {
  constructor(private readonly db: DatabaseService) {}

  async getTree() {
    const colleges = await this.db.query<{
      id: string;
      name: string;
    }>(`SELECT id, name FROM colleges WHERE is_active = TRUE ORDER BY sort_order, name`);
    const majors = await this.db.query<{
      id: string;
      name: string;
      college_id: string;
    }>(`SELECT id, name, college_id FROM majors WHERE is_active = TRUE ORDER BY sort_order, name`);
    const classes = await this.db.query<{
      id: string;
      name: string;
      major_id: string;
    }>(`SELECT id, name, major_id FROM classes WHERE is_active = TRUE ORDER BY name`);

    return [
      {
        key: 'all',
        title: '全部组织',
        children: colleges.rows.map((college) => ({
          key: `college:${college.id}`,
          title: college.name,
          children: majors.rows
            .filter((major) => major.college_id === college.id)
            .map((major) => ({
              key: `major:${major.id}`,
              title: major.name,
              children: classes.rows
                .filter((clazz) => clazz.major_id === major.id)
                .map((clazz) => ({
                  key: `class:${clazz.id}`,
                  title: clazz.name,
                })),
            })),
        })),
      },
    ];
  }

  async addNode(payload: { parentType: 'all' | 'college' | 'major'; parentId?: string; name: string; code?: string }) {
    const name = String(payload.name || '').trim();
    if (!name) throw new BadRequestException('名称不能为空');
    if (payload.parentType === 'all') {
      const code = payload.code?.trim() || `COL${Date.now().toString().slice(-4)}`;
      const result = await this.db.query<{ id: string }>(
        `INSERT INTO colleges (code, name, short_name, is_active, sort_order)
         VALUES ($1, $2, $3, TRUE, 999)
         RETURNING id`,
        [code, name, name.slice(0, 10)],
      );
      return result.rows[0];
    }
    if (payload.parentType === 'college') {
      if (!payload.parentId) throw new BadRequestException('缺少父节点');
      const code = payload.code?.trim() || `M${Date.now().toString().slice(-4)}`;
      const result = await this.db.query<{ id: string }>(
        `INSERT INTO majors (college_id, code, name, short_name, is_active, sort_order)
         VALUES ($1, $2, $3, $4, TRUE, 999)
         RETURNING id`,
        [payload.parentId, code, name, name.slice(0, 10)],
      );
      return result.rows[0];
    }
    if (!payload.parentId) throw new BadRequestException('缺少父节点');
    const major = await this.db.query<{ id: string; name: string; college_id: string }>(
      `SELECT id, name, college_id FROM majors WHERE id = $1`,
      [payload.parentId],
    );
    if (!major.rows[0]) throw new BadRequestException('专业不存在');
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO classes (major_id, name, grade, student_count, is_active)
       VALUES ($1, $2, '2024', 0, TRUE)
       RETURNING id`,
      [payload.parentId, name],
    );
    return result.rows[0];
  }

  async deleteNode(type: 'college' | 'major' | 'class', id: string) {
    if (type === 'college') {
      const hasMajors = await this.db.query(`SELECT 1 FROM majors WHERE college_id = $1 LIMIT 1`, [id]);
      if (hasMajors.rows.length) throw new BadRequestException('该学院下有专业，不可删除');
      await this.db.query(`DELETE FROM colleges WHERE id = $1`, [id]);
      return;
    }
    if (type === 'major') {
      const hasClasses = await this.db.query(`SELECT 1 FROM classes WHERE major_id = $1 LIMIT 1`, [id]);
      if (hasClasses.rows.length) throw new BadRequestException('该专业下有班级，不可删除');
      await this.db.query(`DELETE FROM majors WHERE id = $1`, [id]);
      return;
    }
    const hasStudents = await this.db.query(`SELECT 1 FROM users WHERE class_id = $1 LIMIT 1`, [id]);
    if (hasStudents.rows.length) throw new BadRequestException('该班级下有学生，不可删除');
    await this.db.query(`DELETE FROM classes WHERE id = $1`, [id]);
  }

  private whereScope(scopeType?: string, scopeId?: string) {
    if (!scopeType || !scopeId || scopeType === 'all') {
      return { clause: '', params: [] as unknown[] };
    }
    if (scopeType === 'college') {
      return { clause: ' AND m.college_id = $1 ', params: [scopeId] };
    }
    if (scopeType === 'major') {
      return { clause: ' AND m.id = $1 ', params: [scopeId] };
    }
    if (scopeType === 'class') {
      return { clause: ' AND c.id = $1 ', params: [scopeId] };
    }
    return { clause: '', params: [] as unknown[] };
  }

  async listMajors(query: Record<string, string>) {
    const { clause, params } = this.whereScope(query.scopeType, query.scopeId);
    const keyword = (query.keyword || '').trim();
    const rows = await this.db.query(
      `SELECT m.id, m.code, m.name, c.name AS college_name,
              (SELECT COUNT(*) FROM classes cl WHERE cl.major_id = m.id AND cl.is_active = TRUE) AS class_count,
              (SELECT COUNT(*) FROM courses co WHERE co.major_id = m.id AND co.is_active = TRUE) AS course_count
       FROM majors m
       JOIN colleges c ON c.id = m.college_id
       WHERE m.is_active = TRUE
         ${clause}
         AND ($${params.length + 1} = '' OR m.code ILIKE $${params.length + 2} OR m.name ILIKE $${params.length + 2} OR c.name ILIKE $${params.length + 2})
       ORDER BY m.sort_order, m.name`,
      [...params, keyword, `%${keyword}%`],
    );
    return rows.rows;
  }

  async listClasses(query: Record<string, string>) {
    const { clause, params } = this.whereScope(query.scopeType, query.scopeId);
    const keyword = (query.keyword || '').trim();
    const grade = (query.grade || '').trim();
    const rows = await this.db.query(
      `SELECT c.id, c.name, c.grade, c.student_count, m.name AS major_name,
              COALESCE(t.real_name, '待指定') AS head_teacher_name
       FROM classes c
       JOIN majors m ON m.id = c.major_id
       LEFT JOIN users t ON t.id = c.head_teacher_id
       WHERE c.is_active = TRUE
         ${clause}
         AND ($${params.length + 1} = '' OR c.grade = $${params.length + 1})
         AND ($${params.length + 2} = '' OR c.name ILIKE $${params.length + 3} OR m.name ILIKE $${params.length + 3})
       ORDER BY c.name`,
      [...params, grade, keyword, `%${keyword}%`],
    );
    return rows.rows;
  }

  async listStudents(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const grade = (query.grade || '').trim();
    const status = (query.status || '').trim();
    const { clause, params } = this.whereScope(query.scopeType, query.scopeId);
    const rows = await this.db.query(
      `SELECT u.id, u.username, u.real_name AS name, u.phone, u.status, c.name AS class_name, c.grade,
              m.name AS major_name, sp.id_card_no, sp.household_location, sp.household_address,
              sp.graduate_school, sp.gaokao_score, sp.emergency_contact, sp.emergency_phone, u.email
       FROM users u
       JOIN classes c ON c.id = u.class_id
       JOIN majors m ON m.id = c.major_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'student'
         ${clause}
         AND ($${params.length + 1} = '' OR c.grade = $${params.length + 1})
         AND ($${params.length + 2} = '' OR u.status = $${params.length + 2})
         AND ($${params.length + 3} = '' OR u.username ILIKE $${params.length + 4} OR u.real_name ILIKE $${params.length + 4} OR COALESCE(sp.id_card_no, '') ILIKE $${params.length + 4} OR COALESCE(u.phone, '') ILIKE $${params.length + 4} OR COALESCE(sp.household_location, '') ILIKE $${params.length + 4})
       ORDER BY u.username`,
      [...params, grade, status, keyword, `%${keyword}%`],
    );
    return rows.rows;
  }

  async listTeachers(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const title = (query.title || '').trim();
    const status = (query.status || '').trim();
    const scopeType = query.scopeType;
    const scopeId = query.scopeId;
    let scopeClause = '';
    const scopeParams: unknown[] = [];
    if (scopeType === 'college' && scopeId) {
      scopeClause = ' AND u.college_id = $1 ';
      scopeParams.push(scopeId);
    } else if (scopeType === 'major' && scopeId) {
      scopeClause = ' AND (u.major_id = $1 OR EXISTS (SELECT 1 FROM teacher_courses tc JOIN courses co ON co.id = tc.course_id WHERE tc.teacher_id = u.id AND co.major_id = $1)) ';
      scopeParams.push(scopeId);
    } else if (scopeType === 'class' && scopeId) {
      scopeClause = ' AND EXISTS (SELECT 1 FROM classes target WHERE target.id = $1 AND (u.major_id = target.major_id OR EXISTS (SELECT 1 FROM teacher_courses tc JOIN courses co ON co.id = tc.course_id WHERE tc.teacher_id = u.id AND co.major_id = target.major_id))) ';
      scopeParams.push(scopeId);
    }
    const rows = await this.db.query(
      `SELECT u.id, u.username, u.real_name AS name, u.phone, u.status, u.title, c.name AS college_name,
              tp.id_card_no, tp.education, tp.degree, tp.graduate_school, tp.hire_date, tp.household_location, u.email
       FROM users u
       LEFT JOIN colleges c ON c.id = u.college_id
       LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.role = 'teacher'
         ${scopeClause}
         AND ($${scopeParams.length + 1} = '' OR u.title = $${scopeParams.length + 1})
         AND ($${scopeParams.length + 2} = '' OR u.status = $${scopeParams.length + 2})
         AND ($${scopeParams.length + 3} = '' OR u.username ILIKE $${scopeParams.length + 4} OR u.real_name ILIKE $${scopeParams.length + 4} OR COALESCE(tp.id_card_no, '') ILIKE $${scopeParams.length + 4} OR COALESCE(u.phone, '') ILIKE $${scopeParams.length + 4} OR COALESCE(tp.education, '') ILIKE $${scopeParams.length + 4})
       ORDER BY u.username`,
      [...scopeParams, title, status, keyword, `%${keyword}%`],
    );
    return rows.rows;
  }

  async listCourses(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const examType = (query.examType || '').trim();
    const courseNature = (query.courseNature || '').trim();
    const { clause, params } = this.whereScope(query.scopeType, query.scopeId);
    const rows = await this.db.query(
      `SELECT c.id, c.code, c.name, c.credit, m.name AS major_name, cd.total_hours, cd.theory_hours,
              cd.practice_hours, cd.exam_type, cd.course_nature, cd.offering_department, cd.textbook
       FROM courses c
       JOIN majors m ON m.id = c.major_id
       LEFT JOIN course_details cd ON cd.course_id = c.id
       LEFT JOIN classes cl ON cl.major_id = m.id
       WHERE c.is_active = TRUE
         ${clause}
         AND ($${params.length + 1} = '' OR cd.exam_type = $${params.length + 1})
         AND ($${params.length + 2} = '' OR cd.course_nature = $${params.length + 2})
         AND ($${params.length + 3} = '' OR c.code ILIKE $${params.length + 4} OR c.name ILIKE $${params.length + 4} OR COALESCE(cd.textbook, '') ILIKE $${params.length + 4} OR COALESCE(cd.offering_department, '') ILIKE $${params.length + 4})
       GROUP BY c.id, m.name, cd.total_hours, cd.theory_hours, cd.practice_hours, cd.exam_type, cd.course_nature, cd.offering_department, cd.textbook
       ORDER BY c.code`,
      [...params, examType, courseNature, keyword, `%${keyword}%`],
    );
    return rows.rows;
  }

  async getDetail(tab: string, id: string) {
    if (tab === 'students') {
      const result = await this.db.query(
        `SELECT u.id, u.username, u.real_name AS name, u.phone, u.email, u.status, c.name AS class_name,
                c.grade, m.name AS major_name, col.name AS college_name, sp.*
         FROM users u
         JOIN classes c ON c.id = u.class_id
         JOIN majors m ON m.id = c.major_id
         JOIN colleges col ON col.id = m.college_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1 AND u.role = 'student'`,
        [id],
      );
      return result.rows[0] ?? null;
    }
    if (tab === 'teachers') {
      const result = await this.db.query(
        `SELECT u.id, u.username, u.real_name AS name, u.phone, u.email, u.status, u.title,
                col.name AS college_name, tp.*
         FROM users u
         LEFT JOIN colleges col ON col.id = u.college_id
         LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
         WHERE u.id = $1 AND u.role = 'teacher'`,
        [id],
      );
      return result.rows[0] ?? null;
    }
    if (tab === 'courses') {
      const result = await this.db.query(
        `SELECT c.*, m.name AS major_name, cd.*
         FROM courses c
         JOIN majors m ON m.id = c.major_id
         LEFT JOIN course_details cd ON cd.course_id = c.id
         WHERE c.id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    }
    return null;
  }

  async deleteRow(tab: string, id: string) {
    if (tab === 'majors') {
      const used = await this.db.query(`SELECT 1 FROM classes WHERE major_id = $1 LIMIT 1`, [id]);
      if (used.rows.length) throw new BadRequestException('该专业下有班级，不可删除');
      await this.db.query(`DELETE FROM majors WHERE id = $1`, [id]);
      return;
    }
    if (tab === 'classes') {
      const used = await this.db.query(`SELECT 1 FROM users WHERE class_id = $1 LIMIT 1`, [id]);
      if (used.rows.length) throw new BadRequestException('该班级下有学生，不可删除');
      await this.db.query(`DELETE FROM classes WHERE id = $1`, [id]);
      return;
    }
    if (tab === 'students') {
      await this.db.query(`DELETE FROM users WHERE id = $1 AND role = 'student'`, [id]);
      return;
    }
    if (tab === 'teachers') {
      await this.db.query(`DELETE FROM users WHERE id = $1 AND role = 'teacher'`, [id]);
      return;
    }
    if (tab === 'courses') {
      await this.db.query(`DELETE FROM courses WHERE id = $1`, [id]);
    }
  }
}

