# Design Overview

## Purpose

A lead cleansing and sales handoff MVP: validate the full path from intake → outbound call → WeChat add → follow-up → MQL → SQL, with funnel metrics and exception handling.

**In scope:** manual entry, CSV import, mock integrations, state machine, dashboards.  
**Out of scope:** real telephony/WeChat/CRM connectors, full RBAC, large-scale performance tuning.

## Core Flow

```
Intake → dedupe → TO_CALL → call → VALID/INVALID
  → TO_ADD_WECHAT → WECHAT_ADDED → FOLLOWING → MQL → SQL
```

## Main Statuses

`NEW` · `TO_CALL` · `CALLING` · `VALID` · `INVALID` · `TO_ADD_WECHAT` · `WECHAT_ADDED` · `FOLLOWING` · `MQL` · `SQL` · `CLOSED`

Key rules:

- Invalid leads cannot become MQL/SQL directly
- Must pass WeChat before follow-up / MQL
- MQL requires follow-up + intent level; SQL requires prior MQL
- WeChat failure keeps `TO_ADD_WECHAT`; use retry/close workflow instead of direct close
- Unanswered calls return to `TO_CALL` (not INVALID)

## Data Model (9 tables)

| Table | Role |
|-------|------|
| `leads` | Lifecycle snapshot (status, owner, MQL/SQL timestamps) |
| `sales_users` | Owners (sales / operator / supervisor) |
| `call_records` | Outbound call attempts |
| `follow_up_records` | Sales follow-ups |
| `lead_status_logs` | Main status change audit trail |
| `tasks` | Exceptions (overdue, unassigned, callback/wechat failures) |
| `duplicate_records` | Duplicate intake history |
| `import_batches` | CSV import batches |
| `integration_event_logs` | Webhook idempotency & audit |

Enums are stored as strings in SQLite; allowed values live in `src/lib/enums.ts` and Zod schemas.

## Pages

| Route | Function |
|-------|----------|
| `/dashboard` | Funnel counts, conversion rates, exceptions |
| `/leads` | List, filters, status change time |
| `/leads/new` | Manual create, CSV import |
| `/leads/:id` | Detail: calls, WeChat, follow-ups, MQL/SQL, timeline |
| `/exceptions` | Overdue, unassigned, open tasks |
| `/query` | Natural language metrics / lead queries |
| `/settings/sales-users` | Manage sales team |

## API Highlights

- `POST /api/leads` — create lead (via intake service)
- `POST /api/leads/:id/assign` — assign owner (does not change main status)
- `POST /api/leads/:id/calls` — record call result
- `POST /api/leads/:id/wechat` — WeChat outcome
- `POST /api/leads/:id/followups` — add follow-up
- `POST /api/leads/:id/mql` · `/sql` · `/sql/revoke` — conversions
- `POST /api/integrations/*` — webhook callbacks (HMAC + idempotency)
- `GET /api/dashboard/funnel` — metrics

All main status changes go through `changeStatusTx()` in `src/lib/leadService.ts`.

## Metrics

| Metric | Formula |
|--------|---------|
| Valid rate | valid / called |
| WeChat rate | wechat added / valid |
| MQL rate | mql (by `mql_at`) / wechat added |
| SQL rate | sql (by `sql_at`, not revoked) / mql |
| Overall SQL rate | sql / total leads |
| Avg response | avg(`first_follow_up_at` − `assigned_at`) |
| Overdue | 48h since `assigned_at` or `last_follow_up_at` |

## Integrations

Webhooks use `(source_system, external_event_id)` for idempotency, HMAC-SHA256 auth, and timestamp replay protection. See `src/lib/integration.ts` and routes under `src/app/api/integrations/`.

Simulate callbacks in dev via `/api/integrations/simulate` (disable in production).
