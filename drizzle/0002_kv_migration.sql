-- Drizzle migration: 0002_kv_migration.sql
-- 登录验证码表（替代 KV 存储，一次性使用）

CREATE TABLE IF NOT EXISTS "captchas" (
	"captcha_id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"expire" integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_captchas_expire" ON "captchas" ("expire");

--> drizzle statement: statement-end

-- 管理员会话 + 同步状态表（替代 KV 存储，彻底移除 KV 依赖）

CREATE TABLE IF NOT EXISTS "admin_sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"expiry" integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_admin_sessions_expiry" ON "admin_sessions" ("expiry");

CREATE TABLE IF NOT EXISTS "admin_sync_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"status" text NOT NULL DEFAULT 'idle',
	"result_json" text
);

--> drizzle statement: statement-end
