# 物联网实训箱 · 考试系统后端

知测考试系统后端（NestJS + PostgreSQL）。

## 启动

```bash
# 启动数据库
docker compose up -d

# 安装依赖
npm install

# 写入测试账号
npm run seed:users

# 开发启动（默认端口 3001，避免与前端 3000 冲突）
npm run start:dev
```

## 统一登录

`POST http://127.0.0.1:3001/api/auth/login`

```json
{
  "username": "student01",
  "password": "123456",
  "clientType": "web"
}
```

`clientType`：`web` | `app`（可选，默认 `web`）

测试账号（密码均为 `123456`）：

| 账号 | 角色 |
|---|---|
| admin | 管理员 |
| teacher01 | 教师 |
| student01 | 学生 |

角色策略：Web 端三角色均可登录；App 端仅学生、教师。
