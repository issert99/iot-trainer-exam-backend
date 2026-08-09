import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const users = [
  {
    username: 'admin',
    password: '123456',
    realName: '系统管理员',
    role: 'admin',
    department: '教务处',
    title: '管理员',
  },
  {
    username: 'teacher01',
    password: '123456',
    realName: '张老师',
    role: 'teacher',
    department: '信息工程学院',
    title: '讲师',
  },
  {
    username: 'student01',
    password: '123456',
    realName: '李同学',
    role: 'student',
    department: null,
    title: null,
  },
];

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'exam123456',
    database: process.env.DB_NAME || 'zhice',
  });

  try {
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      const result = await pool.query(
        `INSERT INTO users (username, password_hash, real_name, role, department, title, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           real_name = EXCLUDED.real_name,
           role = EXCLUDED.role,
           department = EXCLUDED.department,
           title = EXCLUDED.title,
           status = 'active',
           updated_at = NOW()
         RETURNING id, username, role`,
        [u.username, hash, u.realName, u.role, u.department, u.title],
      );
      console.log('seeded:', result.rows[0]);
    }
    console.log('测试账号密码均为: 123456');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
