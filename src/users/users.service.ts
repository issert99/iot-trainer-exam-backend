import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UserRow } from './user.types';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findByUsername(username: string): Promise<UserRow | null> {
    const result = await this.db.query<UserRow>(
      `SELECT id, username, password_hash, real_name, role, email, phone,
              avatar_url, major_id, class_id, department, title, status,
              last_login_at, last_login_ip::text AS last_login_ip,
              created_at, updated_at
       FROM users
       WHERE username = $1
       LIMIT 1`,
      [username],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.db.query<UserRow>(
      `SELECT id, username, password_hash, real_name, role, email, phone,
              avatar_url, major_id, class_id, department, title, status,
              last_login_at, last_login_ip::text AS last_login_ip,
              created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async updateLoginMeta(id: string, ip?: string): Promise<void> {
    await this.db.query(
      `UPDATE users
       SET last_login_at = NOW(),
           last_login_ip = NULLIF($2, '')::inet,
           updated_at = NOW()
       WHERE id = $1`,
      [id, ip ?? null],
    );
  }
}
