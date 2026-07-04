import { ALLOWED_TABLES } from "./config";

// 供 LLM 生成 SQL 的 schema 摘要（SQLite 物理表名 + 关键口径）。

export const NL_SQL_SCHEMA_DOC = `
数据库：SQLite。只允许 SELECT（可 WITH），禁止写操作。
表名必须使用下列物理表名（小写 snake_case），且只能查询这些表：
${ALLOWED_TABLES.join(", ")}

## leads（线索主表）
- id, name, phone, source, channel
- main_status: NEW/TO_CALL/CALLING/VALID/INVALID/TO_ADD_WECHAT/WECHAT_ADDED/FOLLOWING/MQL/SQL/CLOSED
- wechat_status: NOT_STARTED/ADDED/FAILED 等
- owner_id → sales_users.id
- mql_at, sql_at, sql_revoked_at（统计 SQL 时需 sql_at IS NOT NULL AND sql_revoked_at IS NULL）
- assigned_at, last_follow_up_at, first_follow_up_at
- created_at, updated_at

## sales_users（销售/负责人）
- id, name, role, email, phone, department, is_active

## call_records（外呼记录）
- lead_id → leads.id, connected(布尔), called_at, call_status, result

## follow_up_records（跟进记录）
- lead_id, owner_id, content, intention_level, created_at

## lead_status_logs（状态变更日志）
- lead_id, from_status, to_status, trigger_source, created_at

## tasks（待办）
- lead_id, task_type, title, status(OPEN/RESOLVED/CLOSED), due_at, created_at

## duplicate_records / import_batches / integration_event_logs
- 导入去重与三方回调日志；integration_event_logs.payload 可能很长，查询时尽量少 SELECT 该字段

## 统计口径提示
- MQL 数：mql_at IS NOT NULL
- 有效 SQL：sql_at IS NOT NULL AND sql_revoked_at IS NULL
- 已加微：wechat_status = 'ADDED'
- 本周：created_at >= date('now', 'weekday 0', '-6 days')（SQLite date 函数）
- 关联负责人：leads.owner_id = sales_users.id

## 输出要求
- 必须写 LIMIT（<=100）
- 聚合查询优先 GROUP BY + ORDER BY
- 不要 SELECT * 大宽表；列出需要的列
`.trim();
