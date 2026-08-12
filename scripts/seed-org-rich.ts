/**
 * 组织人员模块：扩充学院 / 专业 / 行政班 / 师生假数据
 * 参考国内综合大学常见学院与本科专业设置
 *
 * 运行：npx ts-node -r tsconfig-paths/register scripts/seed-org-rich.ts
 */
import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const SURNAMES = [
  '王',
  '李',
  '张',
  '刘',
  '陈',
  '杨',
  '赵',
  '黄',
  '周',
  '吴',
  '徐',
  '孙',
  '胡',
  '朱',
  '高',
  '林',
  '何',
  '郭',
  '马',
  '罗',
  '梁',
  '宋',
  '郑',
  '谢',
  '韩',
  '唐',
  '冯',
  '于',
  '董',
  '萧',
  '程',
  '曹',
  '袁',
  '邓',
  '许',
  '傅',
  '沈',
  '曾',
  '彭',
  '吕',
];

const GIVEN_NAMES = [
  '浩然',
  '子轩',
  '宇轩',
  '明轩',
  '俊杰',
  '思远',
  '志强',
  '嘉懿',
  '昊天',
  '子墨',
  '一诺',
  '诗涵',
  '欣怡',
  '雨桐',
  '梓萱',
  '梦琪',
  '可馨',
  '雨欣',
  '佳怡',
  '思涵',
  '晓彤',
  '若溪',
  '文博',
  '宇航',
  '梓豪',
  '晨曦',
  '语嫣',
  '清妍',
  '景行',
  '子安',
  '宏伟',
  '建华',
  '国强',
  '秀英',
  '桂英',
  '丽华',
  '海燕',
  '鹏飞',
  '文静',
  '雅琴',
];

const CITIES = [
  '湖南长沙',
  '湖北武汉',
  '江西南昌',
  '安徽合肥',
  '河南郑州',
  '四川成都',
  '重庆渝中',
  '广东广州',
  '广西南宁',
  '福建福州',
  '浙江杭州',
  '江苏南京',
  '山东济南',
  '河北石家庄',
  '山西太原',
  '陕西西安',
  '云南昆明',
  '贵州贵阳',
];

const UNIVERSITIES = [
  '华中科技大学',
  '武汉大学',
  '中南大学',
  '湖南大学',
  '西安交通大学',
  '电子科技大学',
  '北京理工大学',
  '南京大学',
  '东南大学',
  '浙江大学',
];

const TITLES = ['助教', '讲师', '副教授', '教授'];
const EDUCATIONS = ['本科', '硕士', '博士'];
const DEGREES = ['学士', '硕士', '博士'];

/** 学院与专业（贴近综合大学常见建制） */
const ORG_TREE: Array<{
  code: string;
  name: string;
  shortName: string;
  majors: Array<{ code: string; name: string; shortName: string }>;
}> = [
  {
    code: 'SIE',
    name: '信息工程学院',
    shortName: '信工',
    majors: [
      { code: 'IOT', name: '物联网工程', shortName: '物联网' },
      { code: 'CS', name: '计算机科学与技术', shortName: '计科' },
      { code: 'SE', name: '软件工程', shortName: '软工' },
      { code: 'AI', name: '人工智能', shortName: '人工智能' },
    ],
  },
  {
    code: 'SFL',
    name: '外国语学院',
    shortName: '外语',
    majors: [
      { code: 'ENG', name: '英语', shortName: '英语' },
      { code: 'JPN', name: '日语', shortName: '日语' },
      { code: 'TRA', name: '翻译', shortName: '翻译' },
    ],
  },
  {
    code: 'SCI',
    name: '理学院',
    shortName: '理学院',
    majors: [
      { code: 'MATH', name: '数学与应用数学', shortName: '数学' },
      { code: 'PHY', name: '物理学', shortName: '物理' },
      { code: 'STAT', name: '统计学', shortName: '统计' },
    ],
  },
  {
    code: 'MED',
    name: '医学院',
    shortName: '医学院',
    majors: [
      { code: 'NURS', name: '护理学', shortName: '护理' },
      { code: 'CLIN', name: '临床医学', shortName: '临床' },
      { code: 'PHARM', name: '药学', shortName: '药学' },
    ],
  },
  {
    code: 'ART',
    name: '艺术学院',
    shortName: '艺术',
    majors: [
      { code: 'DES', name: '视觉传达设计', shortName: '视传' },
      { code: 'MUSIC', name: '音乐学', shortName: '音乐' },
      { code: 'ANIM', name: '动画', shortName: '动画' },
    ],
  },
  {
    code: 'BUS',
    name: '经济管理学院',
    shortName: '经管',
    majors: [
      { code: 'BA', name: '工商管理', shortName: '工商' },
      { code: 'ACC', name: '会计学', shortName: '会计' },
      { code: 'FIN', name: '金融学', shortName: '金融' },
    ],
  },
  {
    code: 'LAW',
    name: '法学院',
    shortName: '法学院',
    majors: [{ code: 'LAW', name: '法学', shortName: '法学' }],
  },
  {
    code: 'ME',
    name: '机械工程学院',
    shortName: '机电',
    majors: [
      { code: 'MECH', name: '机械工程', shortName: '机械' },
      { code: 'AUTO', name: '自动化', shortName: '自动化' },
    ],
  },
];

const GRADES = ['2023', '2024'];
const STUDENTS_PER_CLASS = 42;

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

function randomPhone(seed: number): string {
  const prefixes = ['130', '131', '132', '135', '136', '137', '138', '139', '150', '151', '152', '158', '159', '186', '187', '188'];
  const prefix = pick(prefixes, seed);
  const rest = String(10000000 + ((seed * 7919) % 89999999)).slice(0, 8);
  return `${prefix}${rest}`;
}

function fakeIdCard(seed: number, yearOffset = 2004): string {
  const area = pick(
    ['430102', '420102', '360102', '330106', '320102', '440106', '510104'],
    seed,
  );
  const year = yearOffset + (seed % 4);
  const month = String((seed % 12) + 1).padStart(2, '0');
  const day = String((seed % 28) + 1).padStart(2, '0');
  const seq = String(100 + (seed % 899)).padStart(3, '0');
  return `${area}${year}${month}${day}${seq}X`;
}

function personName(seed: number): string {
  return `${pick(SURNAMES, seed)}${pick(GIVEN_NAMES, seed * 3 + 7)}`;
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'exam123456',
    database: process.env.DB_NAME || 'zhice',
  });

  const client = await pool.connect();
  const passwordHash = await bcrypt.hash('123456', 10);

  try {
    await client.query('BEGIN');

    // ensure profile tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        id_card_no VARCHAR(30),
        household_location VARCHAR(100),
        household_address VARCHAR(255),
        graduate_school VARCHAR(120),
        gaokao_score INT,
        emergency_contact VARCHAR(60),
        emergency_phone VARCHAR(30),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS teacher_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        id_card_no VARCHAR(30),
        education VARCHAR(20),
        degree VARCHAR(20),
        graduate_school VARCHAR(120),
        household_location VARCHAR(100),
        hire_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS course_details (
        course_id UUID PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
        total_hours INT,
        theory_hours INT,
        practice_hours INT,
        exam_type VARCHAR(20) DEFAULT 'exam',
        course_nature VARCHAR(20) DEFAULT 'required',
        offering_department VARCHAR(120),
        textbook VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // rename outdated major display names if present
    await client.query(`
      UPDATE majors SET name = '计算机科学与技术', short_name = '计科' WHERE code = 'CS';
      UPDATE majors SET name = '英语', short_name = '英语' WHERE code = 'ENG';
      UPDATE majors SET name = '数学与应用数学', short_name = '数学' WHERE code = 'MATH';
      UPDATE majors SET name = '护理学', short_name = '护理' WHERE code = 'NURS';
      UPDATE majors SET name = '视觉传达设计', short_name = '视传' WHERE code = 'DES';
    `);

    let teacherSeq = 1;
    let studentSeq = 1;
    let classCreated = 0;
    let studentCreated = 0;
    let teacherCreated = 0;

    for (let ci = 0; ci < ORG_TREE.length; ci++) {
      const college = ORG_TREE[ci]!;
      const collegeRes = await client.query(
        `INSERT INTO colleges (code, name, short_name, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           short_name = EXCLUDED.short_name,
           sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [college.code, college.name, college.shortName, ci + 1],
      );
      const collegeId = collegeRes.rows[0].id as string;

      // teachers per college (8-12)
      const teacherIds: string[] = [];
      const teacherCount = 20 + (ci % 6);
      for (let t = 0; t < teacherCount; t++) {
        const seed = ci * 100 + t;
        const username = `T${2024000 + teacherSeq}`;
        const name = personName(seed + 11);
        const phone = randomPhone(seed + 101);
        const title = pick(TITLES, seed);
        const res = await client.query(
          `INSERT INTO users (username, password_hash, real_name, role, phone, email, college_id, title, status, department)
           VALUES ($1, $2, $3, 'teacher', $4, $5, $6, $7, 'active', $8)
           ON CONFLICT (username) DO UPDATE SET
             real_name = EXCLUDED.real_name,
             phone = EXCLUDED.phone,
             college_id = EXCLUDED.college_id,
             title = EXCLUDED.title,
             department = EXCLUDED.department,
             status = 'active'
           RETURNING id, (xmax = 0) AS inserted`,
          [
            username,
            passwordHash,
            name,
            phone,
            `${username}@univ.edu.cn`,
            collegeId,
            title,
            college.name,
          ],
        );
        const tid = res.rows[0].id as string;
        teacherIds.push(tid);
        if (res.rows[0].inserted) teacherCreated++;
        teacherSeq++;

        await client.query(
          `INSERT INTO teacher_profiles (user_id, id_card_no, education, degree, graduate_school, household_location, hire_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date)
           ON CONFLICT (user_id) DO UPDATE SET
             id_card_no = EXCLUDED.id_card_no,
             education = EXCLUDED.education,
             degree = EXCLUDED.degree,
             graduate_school = EXCLUDED.graduate_school,
             household_location = EXCLUDED.household_location,
             hire_date = EXCLUDED.hire_date`,
          [
            tid,
            fakeIdCard(seed, 1978 + (seed % 15)),
            pick(EDUCATIONS, seed),
            pick(DEGREES, seed),
            pick(UNIVERSITIES, seed),
            pick(CITIES, seed),
            `${2010 + (seed % 14)}-0${(seed % 9) + 1}-15`,
          ],
        );
      }

      for (let mi = 0; mi < college.majors.length; mi++) {
        const major = college.majors[mi]!;
        const majorRes = await client.query(
          `INSERT INTO majors (college_id, code, name, short_name, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (code) DO UPDATE SET
             college_id = EXCLUDED.college_id,
             name = EXCLUDED.name,
             short_name = EXCLUDED.short_name,
             sort_order = EXCLUDED.sort_order,
             is_active = TRUE
           RETURNING id`,
          [collegeId, major.code, major.name, major.shortName, mi + 1],
        );
        const majorId = majorRes.rows[0].id as string;

        // sample courses
        const courseDefs = [
          { code: `${major.code}101`, name: `${major.shortName}导论`, credit: 3 },
          { code: `${major.code}102`, name: `${major.shortName}概论`, credit: 2 },
          { code: `${major.code}201`, name: `${major.shortName}专业基础`, credit: 3.5 },
          { code: `${major.code}202`, name: `${major.shortName}实验`, credit: 2.5 },
          { code: `${major.code}301`, name: `${major.shortName}综合实训`, credit: 4 },
          { code: `${major.code}302`, name: `${major.shortName}课程设计`, credit: 3 },
          { code: `${major.code}401`, name: `${major.shortName}前沿专题`, credit: 2 },
          { code: `${major.code}402`, name: `${major.shortName}毕业实习`, credit: 4 },
        ];
        for (const course of courseDefs) {
          const existingCourse = await client.query(
            `SELECT id FROM courses WHERE major_id = $1 AND code = $2`,
            [majorId, course.code],
          );
          let courseId: string;
          if (existingCourse.rows[0]) {
            courseId = existingCourse.rows[0].id as string;
            await client.query(
              `UPDATE courses SET name = $2, credit = $3, is_active = TRUE WHERE id = $1`,
              [courseId, course.name, course.credit],
            );
          } else {
            const courseRes = await client.query(
              `INSERT INTO courses (major_id, code, name, credit, semester, is_active)
               VALUES ($1, $2, $3, $4, '1', TRUE)
               RETURNING id`,
              [majorId, course.code, course.name, course.credit],
            );
            courseId = courseRes.rows[0].id as string;
          }
          await client.query(
            `INSERT INTO course_details (course_id, total_hours, theory_hours, practice_hours, exam_type, course_nature, offering_department, textbook)
             VALUES ($1, 48, 32, 16, 'exam', 'required', $2, $3)
             ON CONFLICT (course_id) DO UPDATE SET
               total_hours = EXCLUDED.total_hours,
               theory_hours = EXCLUDED.theory_hours,
               practice_hours = EXCLUDED.practice_hours,
               offering_department = EXCLUDED.offering_department,
               textbook = EXCLUDED.textbook`,
            [
              courseId,
              college.name,
              `《${course.name}》（高等教育出版社）`,
            ],
          );
        }

        for (const grade of GRADES) {
          for (let classNo = 1; classNo <= 2; classNo++) {
            const className = `${major.shortName}${grade.slice(2)}${String(classNo).padStart(2, '0')}`;
            const headTeacherId = pick(
              teacherIds,
              mi * 10 + classNo + Number(grade),
            );
            const existingClass = await client.query(
              `SELECT id FROM classes WHERE major_id = $1 AND grade = $2 AND name = $3`,
              [majorId, grade, className],
            );
            let classId: string;
            let classInserted = false;
            if (existingClass.rows[0]) {
              classId = existingClass.rows[0].id as string;
              await client.query(
                `UPDATE classes SET head_teacher_id = $2, is_active = TRUE WHERE id = $1`,
                [classId, headTeacherId],
              );
            } else {
              const classRes = await client.query(
                `INSERT INTO classes (major_id, name, grade, student_count, head_teacher_id, is_active)
                 VALUES ($1, $2, $3, $4, $5, TRUE)
                 RETURNING id`,
                [
                  majorId,
                  className,
                  grade,
                  STUDENTS_PER_CLASS,
                  headTeacherId,
                ],
              );
              classId = classRes.rows[0].id as string;
              classInserted = true;
            }
            if (classInserted) classCreated++;

            // fill students if class has fewer than target
            const countRes = await client.query(
              `SELECT COUNT(*)::int AS cnt FROM users WHERE class_id = $1 AND role = 'student'`,
              [classId],
            );
            let existing = countRes.rows[0].cnt as number;
            while (existing < STUDENTS_PER_CLASS) {
              const seed = studentSeq * 17 + existing;
              const yearPrefix = grade;
              const username = `${yearPrefix}${String(studentSeq).padStart(4, '0')}`;
              const name = personName(seed);
              const phone = randomPhone(seed);
              const city = pick(CITIES, seed);
              const stuRes = await client.query(
                `INSERT INTO users (username, password_hash, real_name, role, phone, email, college_id, major_id, class_id, status)
                 VALUES ($1, $2, $3, 'student', $4, $5, $6, $7, $8, 'active')
                 ON CONFLICT (username) DO UPDATE SET
                   real_name = EXCLUDED.real_name,
                   phone = EXCLUDED.phone,
                   college_id = EXCLUDED.college_id,
                   major_id = EXCLUDED.major_id,
                   class_id = EXCLUDED.class_id,
                   status = 'active'
                 RETURNING id, (xmax = 0) AS inserted`,
                [
                  username,
                  passwordHash,
                  name,
                  phone,
                  `${username}@stu.edu.cn`,
                  collegeId,
                  majorId,
                  classId,
                ],
              );
              const sid = stuRes.rows[0].id as string;
              if (stuRes.rows[0].inserted) studentCreated++;
              studentSeq++;

              await client.query(
                `INSERT INTO student_profiles (user_id, id_card_no, household_location, household_address, graduate_school, gaokao_score, emergency_contact, emergency_phone)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (user_id) DO UPDATE SET
                   id_card_no = EXCLUDED.id_card_no,
                   household_location = EXCLUDED.household_location,
                   household_address = EXCLUDED.household_address,
                   graduate_school = EXCLUDED.graduate_school,
                   gaokao_score = EXCLUDED.gaokao_score,
                   emergency_contact = EXCLUDED.emergency_contact,
                   emergency_phone = EXCLUDED.emergency_phone`,
                [
                  sid,
                  fakeIdCard(seed, Number(grade) - 18),
                  city,
                  `${city}市某某区某某街道${(seed % 200) + 1}号`,
                  `${city.replace(/[省市].*$/, '')}第一中学`,
                  480 + (seed % 160),
                  personName(seed + 99),
                  randomPhone(seed + 333),
                ],
              );
              existing++;
            }

            await client.query(
              `UPDATE classes SET student_count = (
                 SELECT COUNT(*)::int FROM users WHERE class_id = $1 AND role = 'student'
               ) WHERE id = $1`,
              [classId],
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    const summary = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM colleges) AS colleges,
        (SELECT COUNT(*) FROM majors WHERE is_active) AS majors,
        (SELECT COUNT(*) FROM classes WHERE is_active) AS classes,
        (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
        (SELECT COUNT(*) FROM users WHERE role = 'teacher') AS teachers,
        (SELECT COUNT(*) FROM courses WHERE is_active) AS courses
    `);

    console.log('seed done');
    console.log('created this run:', {
      classCreated,
      studentCreated,
      teacherCreated,
    });
    console.log('db totals:', summary.rows[0]);
    console.log('默认密码均为: 123456');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
