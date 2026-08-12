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

  private scopeFilter(
    entity: 'classes' | 'courses' | 'majors' | 'students',
    scopeType?: string,
    scopeId?: string,
  ) {
    if (!scopeType || !scopeId || scopeType === 'all') {
      return { clause: '', params: [] as unknown[] };
    }
    if (entity === 'majors') {
      if (scopeType === 'college') {
        return { clause: ' AND m.college_id = $1 ', params: [scopeId] };
      }
      if (scopeType === 'major') {
        return { clause: ' AND m.id = $1 ', params: [scopeId] };
      }
      if (scopeType === 'class') {
        return {
          clause:
            ' AND EXISTS (SELECT 1 FROM classes sx WHERE sx.major_id = m.id AND sx.id = $1) ',
          params: [scopeId],
        };
      }
    }
    if (entity === 'classes' || entity === 'students') {
      if (scopeType === 'college') {
        return { clause: ' AND m.college_id = $1 ', params: [scopeId] };
      }
      if (scopeType === 'major') {
        return { clause: ' AND m.id = $1 ', params: [scopeId] };
      }
      if (scopeType === 'class') {
        return { clause: ' AND c.id = $1 ', params: [scopeId] };
      }
    }
    if (entity === 'courses') {
      if (scopeType === 'college') {
        return { clause: ' AND m.college_id = $1 ', params: [scopeId] };
      }
      if (scopeType === 'major') {
        return { clause: ' AND m.id = $1 ', params: [scopeId] };
      }
      if (scopeType === 'class') {
        return {
          clause:
            ' AND EXISTS (SELECT 1 FROM classes sx WHERE sx.major_id = m.id AND sx.id = $1) ',
          params: [scopeId],
        };
      }
    }
    return { clause: '', params: [] as unknown[] };
  }

  private toDetailItems(
    row: Record<string, any> | null | undefined,
    labels: Record<string, string>,
  ) {
    if (!row) return { items: [] as Array<{ label: string; value: string }> };
    const items = Object.entries(labels)
      .filter(([key]) => {
        const value = row[key];
        return value !== null && value !== undefined && value !== '';
      })
      .map(([key, label]) => {
        const value = row[key];
        const text =
          value instanceof Date
            ? value.toISOString().slice(0, 10)
            : String(value);
        return { label, value: text };
      });
    return { items };
  }

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
      `SELECT COUNT(*)::int AS total FROM (${dataSql}) AS _org_cnt`,
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

  async listColleges(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const sqlParams = [keyword, `%${keyword}%`];
    const dataSql = `SELECT c.id, c.code, c.name, c.short_name,
              (SELECT COUNT(*)::int FROM majors m WHERE m.college_id = c.id AND m.is_active = TRUE) AS major_count,
              (SELECT COUNT(*)::int FROM classes cl
                 JOIN majors m ON m.id = cl.major_id
                WHERE m.college_id = c.id AND cl.is_active = TRUE) AS class_count,
              (SELECT COUNT(*)::int FROM users u WHERE u.college_id = c.id AND u.role = 'teacher') AS teacher_count
       FROM colleges c
       WHERE c.is_active = TRUE
         AND ($1 = '' OR c.code ILIKE $2 OR c.name ILIKE $2 OR COALESCE(c.short_name, '') ILIKE $2)
       ORDER BY c.sort_order, c.name`;
    return this.withPaging(query, sqlParams, dataSql);
  }

  async listMajors(query: Record<string, string>) {
    const { clause, params } = this.scopeFilter(
      'majors',
      query.scopeType,
      query.scopeId,
    );
    const keyword = (query.keyword || '').trim();
    const sqlParams = [...params, keyword, `%${keyword}%`];
    const dataSql = `SELECT m.id, m.code, m.name, c.name AS college_name,
              (SELECT COUNT(*) FROM classes cl WHERE cl.major_id = m.id AND cl.is_active = TRUE) AS class_count,
              (SELECT COUNT(*) FROM courses co WHERE co.major_id = m.id AND co.is_active = TRUE) AS course_count
       FROM majors m
       JOIN colleges c ON c.id = m.college_id
       WHERE m.is_active = TRUE
         ${clause}
         AND ($${params.length + 1} = '' OR m.code ILIKE $${params.length + 2} OR m.name ILIKE $${params.length + 2} OR c.name ILIKE $${params.length + 2})
       ORDER BY m.sort_order, m.name`;
    return this.withPaging(query, sqlParams, dataSql);
  }

  async listClasses(query: Record<string, string>) {
    const { clause, params } = this.scopeFilter(
      'classes',
      query.scopeType,
      query.scopeId,
    );
    const keyword = (query.keyword || '').trim();
    const grade = (query.grade || '').trim();
    const sqlParams = [...params, grade, keyword, `%${keyword}%`];
    const dataSql = `SELECT c.id, c.name, c.grade,
              (SELECT COUNT(*)::int FROM users u WHERE u.class_id = c.id AND u.role = 'student') AS student_count,
              m.name AS major_name,
              COALESCE(t.real_name, '待指定') AS head_teacher_name
       FROM classes c
       JOIN majors m ON m.id = c.major_id
       LEFT JOIN users t ON t.id = c.head_teacher_id
       WHERE c.is_active = TRUE
         ${clause}
         AND ($${params.length + 1} = '' OR c.grade = $${params.length + 1})
         AND ($${params.length + 2} = '' OR c.name ILIKE $${params.length + 3} OR m.name ILIKE $${params.length + 3})
       ORDER BY c.name`;
    return this.withPaging(query, sqlParams, dataSql);
  }

  async listStudents(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const grade = (query.grade || '').trim();
    const status = (query.status || '').trim();
    const { clause, params } = this.scopeFilter(
      'students',
      query.scopeType,
      query.scopeId,
    );
    const sqlParams = [...params, grade, status, keyword, `%${keyword}%`];
    const dataSql = `SELECT u.id, u.username, u.real_name AS name, u.phone, u.status, c.name AS class_name, c.grade,
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
       ORDER BY u.username`;
    return this.withPaging(query, sqlParams, dataSql);
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
      scopeClause =
        ' AND (u.college_id = (SELECT college_id FROM majors WHERE id = $1) OR u.major_id = $1 OR EXISTS (SELECT 1 FROM teacher_courses tc JOIN courses co ON co.id = tc.course_id WHERE tc.teacher_id = u.id AND co.major_id = $1)) ';
      scopeParams.push(scopeId);
    } else if (scopeType === 'class' && scopeId) {
      scopeClause =
        ' AND u.college_id = (SELECT m.college_id FROM classes cl JOIN majors m ON m.id = cl.major_id WHERE cl.id = $1) ';
      scopeParams.push(scopeId);
    }
    const sqlParams = [...scopeParams, title, status, keyword, `%${keyword}%`];
    const dataSql = `SELECT u.id, u.username, u.real_name AS name, u.phone, u.status, u.title, c.name AS college_name,
              tp.id_card_no, tp.education, tp.degree, tp.graduate_school, tp.hire_date, tp.household_location, u.email
       FROM users u
       LEFT JOIN colleges c ON c.id = u.college_id
       LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.role = 'teacher'
         ${scopeClause}
         AND ($${scopeParams.length + 1} = '' OR u.title = $${scopeParams.length + 1})
         AND ($${scopeParams.length + 2} = '' OR u.status = $${scopeParams.length + 2})
         AND ($${scopeParams.length + 3} = '' OR u.username ILIKE $${scopeParams.length + 4} OR u.real_name ILIKE $${scopeParams.length + 4} OR COALESCE(tp.id_card_no, '') ILIKE $${scopeParams.length + 4} OR COALESCE(u.phone, '') ILIKE $${scopeParams.length + 4} OR COALESCE(tp.education, '') ILIKE $${scopeParams.length + 4})
       ORDER BY u.username`;
    return this.withPaging(query, sqlParams, dataSql);
  }

  async listCourses(query: Record<string, string>) {
    const keyword = (query.keyword || '').trim();
    const examType = (query.examType || '').trim();
    const courseNature = (query.courseNature || '').trim();
    const { clause, params } = this.scopeFilter(
      'courses',
      query.scopeType,
      query.scopeId,
    );
    const sqlParams = [...params, examType, courseNature, keyword, `%${keyword}%`];
    const dataSql = `SELECT c.id, c.code, c.name, c.credit, m.name AS major_name, cd.total_hours, cd.theory_hours,
              cd.practice_hours, cd.exam_type, cd.course_nature, cd.offering_department, cd.textbook
       FROM courses c
       JOIN majors m ON m.id = c.major_id
       LEFT JOIN course_details cd ON cd.course_id = c.id
       WHERE c.is_active = TRUE
         ${clause}
         AND ($${params.length + 1} = '' OR cd.exam_type = $${params.length + 1})
         AND ($${params.length + 2} = '' OR cd.course_nature = $${params.length + 2})
         AND ($${params.length + 3} = '' OR c.code ILIKE $${params.length + 4} OR c.name ILIKE $${params.length + 4} OR COALESCE(cd.textbook, '') ILIKE $${params.length + 4} OR COALESCE(cd.offering_department, '') ILIKE $${params.length + 4})
       ORDER BY c.code`;
    return this.withPaging(query, sqlParams, dataSql);
  }

  async getDetail(tab: string, id: string) {
    if (tab === 'students') {
      const result = await this.db.query(
        `SELECT u.username AS student_no, u.real_name AS name, u.phone, u.email,
                CASE u.status WHEN 'active' THEN '正常' WHEN 'locked' THEN '锁定' ELSE '禁用' END AS status_label,
                c.name AS class_name, c.grade, m.name AS major_name, col.name AS college_name,
                sp.id_card_no, sp.household_location, sp.household_address, sp.graduate_school,
                sp.gaokao_score, sp.emergency_contact, sp.emergency_phone
         FROM users u
         JOIN classes c ON c.id = u.class_id
         JOIN majors m ON m.id = c.major_id
         JOIN colleges col ON col.id = m.college_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1 AND u.role = 'student'`,
        [id],
      );
      return this.toDetailItems(result.rows[0], {
        student_no: '学号',
        name: '姓名',
        phone: '手机号',
        email: '邮箱',
        status_label: '状态',
        college_name: '学院',
        major_name: '专业',
        class_name: '行政班',
        grade: '年级',
        id_card_no: '身份证号',
        household_location: '户籍地',
        household_address: '户籍地址',
        graduate_school: '毕业中学',
        gaokao_score: '高考成绩',
        emergency_contact: '紧急联系人',
        emergency_phone: '紧急联系电话',
      });
    }
    if (tab === 'teachers') {
      const result = await this.db.query(
        `SELECT u.username AS teacher_no, u.real_name AS name, u.phone, u.email, u.title,
                CASE u.status WHEN 'active' THEN '在岗' ELSE '停用' END AS status_label,
                col.name AS college_name, tp.id_card_no, tp.education, tp.degree,
                tp.graduate_school, tp.household_location, tp.hire_date
         FROM users u
         LEFT JOIN colleges col ON col.id = u.college_id
         LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
         WHERE u.id = $1 AND u.role = 'teacher'`,
        [id],
      );
      return this.toDetailItems(result.rows[0], {
        teacher_no: '工号',
        name: '姓名',
        title: '职称',
        phone: '手机号',
        email: '邮箱',
        status_label: '状态',
        college_name: '所属学院',
        education: '学历',
        degree: '学位',
        graduate_school: '毕业院校',
        household_location: '户籍地',
        id_card_no: '身份证号',
        hire_date: '入职日期',
      });
    }
    if (tab === 'courses') {
      const result = await this.db.query(
        `SELECT c.code AS course_code, c.name AS course_name, c.credit, c.semester,
                m.name AS major_name, cd.total_hours, cd.theory_hours, cd.practice_hours,
                CASE cd.exam_type WHEN 'exam' THEN '考试' ELSE '考查' END AS exam_type_label,
                CASE cd.course_nature WHEN 'required' THEN '必修' ELSE '选修' END AS course_nature_label,
                cd.offering_department, cd.textbook
         FROM courses c
         JOIN majors m ON m.id = c.major_id
         LEFT JOIN course_details cd ON cd.course_id = c.id
         WHERE c.id = $1`,
        [id],
      );
      return this.toDetailItems(result.rows[0], {
        course_code: '课程代码',
        course_name: '课程名称',
        major_name: '所属专业',
        credit: '学分',
        semester: '开课学期',
        course_nature_label: '课程性质',
        exam_type_label: '考核方式',
        total_hours: '总学时',
        theory_hours: '理论学时',
        practice_hours: '实践学时',
        offering_department: '开课单位',
        textbook: '教材',
      });
    }
    if (tab === 'classes') {
      const result = await this.db.query(
        `SELECT c.name AS class_name, c.grade, m.name AS major_name, col.name AS college_name,
                COALESCE(t.real_name, '待指定') AS head_teacher_name,
                COALESCE(t.phone, '-') AS head_teacher_phone,
                (SELECT COUNT(*)::int FROM users u WHERE u.class_id = c.id AND u.role = 'student') AS student_count
         FROM classes c
         JOIN majors m ON m.id = c.major_id
         JOIN colleges col ON col.id = m.college_id
         LEFT JOIN users t ON t.id = c.head_teacher_id
         WHERE c.id = $1`,
        [id],
      );
      return this.toDetailItems(result.rows[0], {
        class_name: '行政班',
        grade: '年级',
        college_name: '学院',
        major_name: '专业',
        student_count: '学生人数',
        head_teacher_name: '班主任',
        head_teacher_phone: '班主任电话',
      });
    }
    if (tab === 'colleges') {
      const result = await this.db.query(
        `SELECT c.code, c.name, c.short_name, c.description,
                (SELECT COUNT(*)::int FROM majors m WHERE m.college_id = c.id AND m.is_active = TRUE) AS major_count,
                (SELECT COUNT(*)::int FROM classes cl
                   JOIN majors m ON m.id = cl.major_id
                  WHERE m.college_id = c.id AND cl.is_active = TRUE) AS class_count,
                (SELECT COUNT(*)::int FROM users u WHERE u.college_id = c.id AND u.role = 'teacher') AS teacher_count,
                (SELECT COUNT(*)::int FROM users u
                   JOIN classes cl ON cl.id = u.class_id
                   JOIN majors m ON m.id = cl.major_id
                  WHERE m.college_id = c.id AND u.role = 'student') AS student_count
         FROM colleges c
         WHERE c.id = $1`,
        [id],
      );
      return this.toDetailItems(result.rows[0], {
        code: '学院代码',
        name: '学院名称',
        short_name: '学院简称',
        description: '简介',
        major_count: '专业数量',
        class_count: '行政班数量',
        teacher_count: '教师人数',
        student_count: '学生人数',
      });
    }
    if (tab === 'majors') {
      const result = await this.db.query(
        `SELECT m.code AS major_code, m.name AS major_name, m.short_name,
                col.name AS college_name,
                (SELECT COUNT(*)::int FROM classes cl WHERE cl.major_id = m.id AND cl.is_active = TRUE) AS class_count,
                (SELECT COUNT(*)::int FROM courses co WHERE co.major_id = m.id AND co.is_active = TRUE) AS course_count,
                (SELECT COUNT(*)::int FROM users u
                   JOIN classes cl ON cl.id = u.class_id
                  WHERE cl.major_id = m.id AND u.role = 'student') AS student_count
         FROM majors m
         JOIN colleges col ON col.id = m.college_id
         WHERE m.id = $1`,
        [id],
      );
      return this.toDetailItems(result.rows[0], {
        major_code: '专业代码',
        major_name: '专业名称',
        short_name: '专业简称',
        college_name: '所属学院',
        class_count: '行政班数量',
        course_count: '课程数量',
        student_count: '学生人数',
      });
    }
    return { items: [] };
  }

  async createRow(tab: string, body: Record<string, any>) {
    if (tab === 'colleges') {
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      if (!code || !name) {
        throw new BadRequestException('学院代码和名称不能为空');
      }
      const shortName = String(body.shortName || body.short_name || name).slice(
        0,
        20,
      );
      const result = await this.db.query(
        `INSERT INTO colleges (code, name, short_name, description, is_active, sort_order)
         VALUES ($1, $2, $3, $4, TRUE, 999) RETURNING id`,
        [code, name, shortName, body.description || null],
      );
      return result.rows[0];
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(
      String(body.password || '123456'),
      10,
    );

    if (tab === 'majors') {
      const collegeId = body.collegeId || body.college_id;
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      if (!collegeId || !code || !name) {
        throw new BadRequestException('学院、专业代码、专业名称不能为空');
      }
      const result = await this.db.query(
        `INSERT INTO majors (college_id, code, name, short_name, is_active, sort_order)
         VALUES ($1, $2, $3, $4, TRUE, 999) RETURNING id`,
        [collegeId, code, name, String(body.shortName || name).slice(0, 10)],
      );
      return result.rows[0];
    }

    if (tab === 'classes') {
      const majorId = body.majorId || body.major_id;
      const name = String(body.name || '').trim();
      const grade = String(body.grade || '2024').trim();
      if (!majorId || !name) {
        throw new BadRequestException('专业和班级名称不能为空');
      }
      const result = await this.db.query(
        `INSERT INTO classes (major_id, name, grade, student_count, head_teacher_id, is_active)
         VALUES ($1, $2, $3, 0, $4, TRUE) RETURNING id`,
        [majorId, name, grade, body.headTeacherId || body.head_teacher_id || null],
      );
      return result.rows[0];
    }

    if (tab === 'students') {
      const username = String(body.username || body.studentNo || '').trim();
      const name = String(body.name || body.realName || '').trim();
      const classId = body.classId || body.class_id;
      if (!username || !name || !classId) {
        throw new BadRequestException('学号、姓名、班级不能为空');
      }
      const classInfo = await this.db.query(
        `SELECT c.id, c.major_id, m.college_id FROM classes c JOIN majors m ON m.id = c.major_id WHERE c.id = $1`,
        [classId],
      );
      if (!classInfo.rows[0]) throw new BadRequestException('班级不存在');
      const result = await this.db.query(
        `INSERT INTO users (username, password_hash, real_name, role, phone, email, college_id, major_id, class_id, status)
         VALUES ($1, $2, $3, 'student', $4, $5, $6, $7, $8, 'active') RETURNING id`,
        [
          username,
          passwordHash,
          name,
          body.phone || null,
          body.email || `${username}@stu.edu.cn`,
          classInfo.rows[0].college_id,
          classInfo.rows[0].major_id,
          classId,
        ],
      );
      const userId = result.rows[0].id;
      await this.db.query(
        `INSERT INTO student_profiles (user_id, id_card_no, household_location, household_address, graduate_school, gaokao_score, emergency_contact, emergency_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          userId,
          body.idCardNo || body.id_card_no || null,
          body.householdLocation || body.household_location || null,
          body.householdAddress || body.household_address || null,
          body.graduateSchool || body.graduate_school || null,
          body.gaokaoScore || body.gaokao_score || null,
          body.emergencyContact || body.emergency_contact || null,
          body.emergencyPhone || body.emergency_phone || null,
        ],
      );
      await this.db.query(
        `UPDATE classes SET student_count = (SELECT COUNT(*)::int FROM users WHERE class_id = $1 AND role = 'student') WHERE id = $1`,
        [classId],
      );
      return result.rows[0];
    }

    if (tab === 'teachers') {
      const username = String(body.username || body.teacherNo || '').trim();
      const name = String(body.name || body.realName || '').trim();
      const collegeId = body.collegeId || body.college_id;
      if (!username || !name) {
        throw new BadRequestException('工号和姓名不能为空');
      }
      const result = await this.db.query(
        `INSERT INTO users (username, password_hash, real_name, role, phone, email, college_id, title, status, department)
         VALUES ($1, $2, $3, 'teacher', $4, $5, $6, $7, 'active', $8) RETURNING id`,
        [
          username,
          passwordHash,
          name,
          body.phone || null,
          body.email || `${username}@univ.edu.cn`,
          collegeId || null,
          body.title || '讲师',
          body.department || null,
        ],
      );
      const userId = result.rows[0].id;
      await this.db.query(
        `INSERT INTO teacher_profiles (user_id, id_card_no, education, degree, graduate_school, household_location, hire_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          userId,
          body.idCardNo || body.id_card_no || null,
          body.education || '硕士',
          body.degree || '硕士',
          body.graduateSchool || body.graduate_school || null,
          body.householdLocation || body.household_location || null,
          body.hireDate || body.hire_date || null,
        ],
      );
      return result.rows[0];
    }

    if (tab === 'courses') {
      const majorId = body.majorId || body.major_id;
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      if (!majorId || !code || !name) {
        throw new BadRequestException('专业、课程代码、课程名称不能为空');
      }
      const result = await this.db.query(
        `INSERT INTO courses (major_id, code, name, credit, semester, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
        [
          majorId,
          code,
          name,
          Number(body.credit || 3),
          String(body.semester || '1'),
        ],
      );
      const courseId = result.rows[0].id;
      await this.db.query(
        `INSERT INTO course_details (course_id, total_hours, theory_hours, practice_hours, exam_type, course_nature, offering_department, textbook)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (course_id) DO NOTHING`,
        [
          courseId,
          Number(body.totalHours || body.total_hours || 48),
          Number(body.theoryHours || body.theory_hours || 32),
          Number(body.practiceHours || body.practice_hours || 16),
          body.examType || body.exam_type || 'exam',
          body.courseNature || body.course_nature || 'required',
          body.offeringDepartment || body.offering_department || null,
          body.textbook || null,
        ],
      );
      return result.rows[0];
    }

    throw new BadRequestException('不支持的数据类型');
  }

  async importRows(tab: string, rows: Record<string, any>[]) {
    let success = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        await this.createRow(tab, rows[i] || {});
        success += 1;
      } catch (error: any) {
        errors.push(`第 ${i + 1} 行: ${error?.message || '导入失败'}`);
      }
    }
    return { success, failed: errors.length, errors: errors.slice(0, 20) };
  }

  async deleteRow(tab: string, id: string) {
    if (tab === 'colleges') {
      const used = await this.db.query(
        `SELECT 1 FROM majors WHERE college_id = $1 LIMIT 1`,
        [id],
      );
      if (used.rows.length) {
        throw new BadRequestException('该学院下有专业，不可删除');
      }
      await this.db.query(`DELETE FROM colleges WHERE id = $1`, [id]);
      return;
    }
    if (tab === 'majors') {
      const used = await this.db.query(
        `SELECT 1 FROM classes WHERE major_id = $1 LIMIT 1`,
        [id],
      );
      if (used.rows.length) {
        throw new BadRequestException('该专业下有班级，不可删除');
      }
      await this.db.query(`DELETE FROM majors WHERE id = $1`, [id]);
      return;
    }
    if (tab === 'classes') {
      const used = await this.db.query(
        `SELECT 1 FROM users WHERE class_id = $1 LIMIT 1`,
        [id],
      );
      if (used.rows.length) {
        throw new BadRequestException('该班级下有学生，不可删除');
      }
      await this.db.query(`DELETE FROM classes WHERE id = $1`, [id]);
      return;
    }
    if (tab === 'students') {
      await this.db.query(
        `DELETE FROM users WHERE id = $1 AND role = 'student'`,
        [id],
      );
      return;
    }
    if (tab === 'teachers') {
      await this.db.query(
        `DELETE FROM users WHERE id = $1 AND role = 'teacher'`,
        [id],
      );
      return;
    }
    if (tab === 'courses') {
      await this.db.query(`DELETE FROM courses WHERE id = $1`, [id]);
    }
  }

  async listOptions() {
    const colleges = await this.db.query(
      `SELECT id, name FROM colleges WHERE is_active = TRUE ORDER BY sort_order, name`,
    );
    const majors = await this.db.query(
      `SELECT id, name, college_id FROM majors WHERE is_active = TRUE ORDER BY sort_order, name`,
    );
    const classes = await this.db.query(
      `SELECT id, name, major_id, grade FROM classes WHERE is_active = TRUE ORDER BY name`,
    );
    const teachers = await this.db.query(
      `SELECT id, real_name AS name, college_id FROM users WHERE role = 'teacher' AND status = 'active' ORDER BY username`,
    );
    return {
      colleges: colleges.rows,
      majors: majors.rows,
      classes: classes.rows,
      teachers: teachers.rows,
    };
  }
}

