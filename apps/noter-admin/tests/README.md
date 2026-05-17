# noter-admin · 测试指南

本目录覆盖 tasks.md §16 中的所有测试任务。测试分为 3 类:

| 类型 | 工具 | 路径 | 跑法 |
| --- | --- | --- | --- |
| 单元测试 | Vitest | `lib/**/*.test.ts` | `pnpm --filter noter-admin test` |
| 集成测试 | Vitest + 真实 Supabase | `tests/integration/*.test.ts` | `pnpm --filter noter-admin test tests/integration` |
| E2E | Playwright | `tests/e2e/*.spec.ts` | `pnpm exec playwright test` |

> 集成测试与 E2E 测试都依赖**真实**的 Supabase 实例与运行中的 noter-admin。
> 如果未配置相应环境变量,Vitest 会通过 `describe.skipIf(...)` 自动跳过整组测试,
> Playwright 会通过 `test.skip(...)` 自动跳过。

---

## 1. 单元测试

零依赖,任何机器都能直接跑。源码与测试放一起(co-located),由
`vitest.config.ts` 中 `include: ['lib/**/*.test.ts', ...]` 自动收敛。

```bash
pnpm --filter noter-admin test
```

---

## 2. 集成测试 (Tasks 16.4 ~ 16.8)

### 2.1 一次性环境准备

**a. 启动本地 Supabase 容器**

在项目根目录执行(假设已安装 `supabase` CLI):

```bash
supabase start
```

输出会列出 `API URL` / `service_role key` / `anon key` / `JWT secret` 等。
记下这些值,用于下一步。

**b. 应用 migration**

```bash
supabase db reset       # 自动重建库 + 应用所有 migration
```

或手动:

```bash
supabase migration up
```

**c. 执行 seed 脚本**

```bash
cd apps/noter-admin
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
NOTER_SUPER_ADMIN_EMAIL=super@noter.test \
pnpm seed:admin
```

注意:`NOTER_SUPER_ADMIN_EMAIL` 指向的账号必须先通过 noter-web 注册才能被提升为 super_admin。
也可以在测试 setup 中直接通过 `_helpers.createTestUser({ role: 'super_admin' })` 动态创建。

**d. 启动 noter-admin 开发服务器**

```bash
cd apps/noter-admin
pnpm dev   # 默认 :3001
```

### 2.2 配置环境变量

在 `apps/noter-admin/` 下创建 `.env.test.local`(已加入 .gitignore),填入:

```bash
# 必需:Supabase 本地实例
SUPABASE_TEST_URL=http://127.0.0.1:54321
SUPABASE_TEST_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_TEST_ANON_KEY=<anon_key>

# 必需:noter-admin 服务地址
NOTER_ADMIN_BASE_URL=http://localhost:3001

# 可选:跳过 pipeline 等待(适合本地无 LLM 配置时)
# SKIP_PIPELINE_WAIT=1
```

加载方式取决于本地 shell:

```bash
# 方式 1:直接 export
set -a; source .env.test.local; set +a

# 方式 2:配合 dotenv-cli
pnpm dlx dotenv-cli -e .env.test.local -- pnpm test tests/integration
```

### 2.3 跑集成测试

```bash
# 全部
pnpm --filter noter-admin test tests/integration

# 单文件
pnpm --filter noter-admin test tests/integration/route-handlers-happy-path.test.ts
pnpm --filter noter-admin test tests/integration/permission-matrix.test.ts
pnpm --filter noter-admin test tests/integration/public-document-upload.test.ts
pnpm --filter noter-admin test tests/integration/public-document-edit-rollback.test.ts
pnpm --filter noter-admin test tests/integration/rls-anon-access.test.ts
```

### 2.4 测试覆盖说明

| 测试文件 | tasks.md | 覆盖 design.md 节 |
| --- | --- | --- |
| `route-handlers-happy-path.test.ts` | 16.4 | §6 全部 API Endpoints |
| `permission-matrix.test.ts` | 16.5 | §Correctness Properties · Property 2 |
| `public-document-upload.test.ts` | 16.6 | §7.2 |
| `public-document-edit-rollback.test.ts` | 16.7 | §7.3 / §7.4 / Property 3 |
| `rls-anon-access.test.ts` | 16.8 | §5.4 / Property 5 |

集成测试每个文件都有自管理的 `beforeAll/afterAll`,通过 service_role 直接 insert/delete
测试用户与文档,确保隔离;失败用例不影响其他文件。

### 2.5 集成测试常见坑

- **Service role key 未注入**:`describe.skipIf` 会让所有测试通过,但实际并未执行。
  日志末尾若出现 `0 passed | 0 failed | N skipped`,确认环境变量是否生效。
- **dev 服务器没启动**:fetch 会立刻 ECONNREFUSED,排错从 `NOTER_ADMIN_BASE_URL` 入手。
- **Pipeline 超时**:在 16.6 中等待 `status=ready` 默认 60s,真实 LLM 抓不到结果时设
  `SKIP_PIPELINE_WAIT=1` 跳过该用例,只验证 upload + processing 步骤。
- **super_admin 唯一性**:`profiles_super_admin_uniq` partial index 限制同时只有 1 个 super_admin。
  集成测试中如需 super_admin,应先确保数据库里没有任何 super_admin(seed 脚本未设置或先降级)。

---

## 3. E2E 测试 (Tasks 16.9 ~ 16.10)

### 3.1 安装 Playwright

`@playwright/test` **没有**写到 `package.json`。运行前手动安装:

```bash
cd apps/noter-admin
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

`playwright.config.ts` 已就绪(单 worker / 单浏览器,适合登录流程类测试)。

### 3.2 准备测试账号

E2E 直接通过 UI 登录,需要事先存在两个真实账号:

```
admin@noter.test       (role=admin, deleted=0, not_active=0)
user@noter.test        (role=user,  deleted=0, not_active=0)
```

可以通过 noter-web 注册后用 SQL 把 admin 账号的 role 升级:

```sql
UPDATE public.profiles SET role = 'admin'
 WHERE email = 'admin@noter.test';
```

### 3.3 配置环境变量

在同样的 `.env.test.local` 里追加:

```bash
# E2E 必需
NOTER_ADMIN_BASE_URL=http://localhost:3001
E2E_ADMIN_EMAIL=admin@noter.test
E2E_ADMIN_PASSWORD=<your-admin-password>
E2E_USER_EMAIL=user@noter.test
E2E_USER_PASSWORD=<your-user-password>

# 可选
SKIP_PIPELINE_WAIT=1   # 16.10 上传测试不等待 pipeline 真正 ready
```

### 3.4 启动 noter-admin

E2E 假设服务器已经在 `NOTER_ADMIN_BASE_URL` 跑着:

```bash
pnpm --filter noter-admin dev
```

### 3.5 跑 E2E 测试

```bash
# 全部 (chromium 单浏览器)
pnpm exec playwright test

# 单文件
pnpm exec playwright test tests/e2e/sign-in.spec.ts
pnpm exec playwright test tests/e2e/public-document-upload.spec.ts

# 带界面
pnpm exec playwright test --headed
```

### 3.6 E2E 测试覆盖说明

| 测试文件 | tasks.md | 设计参考 |
| --- | --- | --- |
| `sign-in.spec.ts` | 16.9 | §7.1 / §8.1 / §8.3 |
| `public-document-upload.spec.ts` | 16.10 | §7.2 / §8.1 |

---

## 4. CI 集成建议

集成测试与 E2E 在 CI 里建议放在独立的 job:

```yaml
# .github/workflows/test.yml(示例)
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm --filter noter-admin test

  integration:
    runs-on: ubuntu-latest
    services:
      supabase:
        image: supabase/postgres:15.1.0.117
        # ...或者使用 supabase/setup-cli 的官方 action
    env:
      SUPABASE_TEST_URL: http://127.0.0.1:54321
      SUPABASE_TEST_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      SUPABASE_TEST_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      NOTER_ADMIN_BASE_URL: http://localhost:3001
    steps:
      - run: pnpm --filter noter-admin build
      - run: pnpm --filter noter-admin start &
      - run: pnpm --filter noter-admin test tests/integration

  e2e:
    runs-on: ubuntu-latest
    env:
      NOTER_ADMIN_BASE_URL: http://localhost:3001
      E2E_ADMIN_EMAIL: ${{ secrets.E2E_ADMIN_EMAIL }}
      E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}
      E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
      E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
      SKIP_PIPELINE_WAIT: '1'
    steps:
      - run: pnpm install
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm --filter noter-admin start &
      - run: pnpm exec playwright test
```

---

## 5. 需要本地数据完全清理时

集成测试有自管理的 cleanup,但偶发场景(测试中途崩溃)可能残留数据。强制重置:

```bash
supabase db reset
```

之后重跑 seed:

```bash
pnpm --filter noter-admin seed:admin
```
