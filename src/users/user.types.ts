export type UserRole = 'student' | 'teacher' | 'admin';
export type UserStatus = 'active' | 'inactive' | 'locked';
export type ClientType = 'web' | 'app';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  real_name: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  major_id: string | null;
  class_id: string | null;
  department: string | null;
  title: string | null;
  status: UserStatus;
  last_login_at: Date | null;
  last_login_ip: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: string;
  username: string;
  realName: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  majorId: string | null;
  classId: string | null;
  department: string | null;
  title: string | null;
  status: UserStatus;
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    realName: user.real_name,
    role: user.role,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    majorId: user.major_id,
    classId: user.class_id,
    department: user.department,
    title: user.title,
    status: user.status,
  };
}
