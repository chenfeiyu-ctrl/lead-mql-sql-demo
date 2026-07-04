# Lead MQL/SQL MVP

市场线索从录入、外呼清洗、加企微、销售跟进到 MQL/SQL 转化的闭环演示系统。

Next.js 14 · Prisma · SQLite · 状态机 · 漏斗看板 · 异常待办 · CSV 去重 · 三方回调模拟

## 功能

- 完整生命周期：`待外呼 → 外呼中 → 有效 → 待加微 → 已加微 → 跟进中 → MQL → SQL`
- 状态机白名单 + 乐观锁 + 主状态变更审计日志
- MQL/SQL 前置校验、原因记录、SQL 误标撤销
- 漏斗看板、渠道下钻、48h 未跟进 / 未分配异常
- CSV 导入、手机号去重、终止线索重新激活
- 外呼/企微回调（HMAC 鉴权 + 幂等）
- 自然语言查询（可选 DeepSeek + 受控 Text-to-SQL）

## 快速启动

**环境：** Node.js 18+

```bash
git clone https://github.com/chenfeiyu-ctrl/lead-mql-sql-demo.git
cd lead-mql-sql-demo

cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)

重置演示数据：

```bash
npm run db:reset
```

## 演示数据

`npm run seed` 会生成 5 名销售/运营/主管、55 条各阶段线索，以及外呼、跟进、异常待办等。

当前**无真实登录**，在详情页选择「操作人」即可模拟不同角色操作。

## 目录结构

```text
├── prisma/           # Schema、migrations、seed
├── public/           # 静态资源（CSV 样例）
├── src/
│   ├── app/          # 页面与 API（App Router）
│   ├── components/   # 通用 UI
│   └── lib/          # 状态机、指标、NL 查询、集成回调
├── docs/DESIGN.md    # 业务与技术设计摘要
└── scripts/          # 演示环境重置脚本
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发 |
| `npm run build` | 生产构建 |
| `npm run start` | 运行生产包 |
| `npm test` | 单元测试 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run lint` | ESLint |
| `npm run seed` | 写入演示数据 |
| `npm run db:reset` | 重建库并 re-seed |

## 环境变量

复制 `.env.example` 为 `.env`：

```env
DATABASE_URL="file:./dev.db"
INTEGRATION_WEBHOOK_SECRET="change-me-in-production"
```

智能查询（可选）：

```env
DEEPSEEK_API_KEY=""
NL_SQL_MODE="hybrid"   # off | readonly | hybrid
```

未配置 `DEEPSEEK_API_KEY` 时，`/query` 仍可使用规则解析，不影响其他功能。

## 设计文档

详见 [docs/DESIGN.md](docs/DESIGN.md)（状态机、数据模型、API 与指标口径）。

## 说明

本项目为**本地演示 MVP**，非生产系统：无登录/RBAC、SQLite 单文件库、CSV 同步导入、不对接真实 CRM。

## License

MIT
