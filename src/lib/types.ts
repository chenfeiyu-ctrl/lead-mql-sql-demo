// 枚举的 TypeScript 联合类型。
// SQLite 下 Prisma 字段以 String 存储，这里提供类型安全的取值集合；
// 与 prisma/schema.prisma 注释、docs/13 §3、enums.ts 保持一致。

export type MainStatus =
  | "NEW"
  | "TO_CALL"
  | "CALLING"
  | "VALID"
  | "INVALID"
  | "TO_ADD_WECHAT"
  | "WECHAT_ADDED"
  | "FOLLOWING"
  | "MQL"
  | "SQL"
  | "CLOSED";

export type CallStatus =
  | "NOT_CALLED"
  | "CALLING"
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "INVALID_PHONE"
  | "REJECTED"
  | "CALLBACK_FAILED";

export type WechatStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "ADDED"
  | "FAILED"
  | "REJECTED";

export type FollowStatus =
  | "NOT_FOLLOWED"
  | "FOLLOWING"
  | "FOLLOWED"
  | "NURTURING"
  | "CLOSED";

export type InvalidReason =
  | "INVALID_PHONE"
  | "NO_DEMAND"
  | "REJECTED"
  | "NOT_TARGET_CUSTOMER"
  | "DUPLICATE"
  | "SPAM"
  | "UNREACHABLE";

export type LeadLevel = "A" | "B" | "C" | "D";

export type SalesRole = "SALES" | "SUPERVISOR" | "OPERATOR";

export type TriggerSource =
  | "MANUAL"
  | "SYSTEM"
  | "IMPORT"
  | "CALL_CALLBACK"
  | "WECHAT_CALLBACK";

export type TaskType =
  | "OVERDUE_FOLLOW_UP"
  | "UNASSIGNED"
  | "CALLBACK_FAILED"
  | "WECHAT_FAILED"
  | "DUPLICATE_CONFLICT";

export type TaskStatus = "OPEN" | "RESOLVED" | "CLOSED";

export type IntentionLevel = "LOW" | "MEDIUM" | "HIGH";

export type DuplicateAction = "MERGE_SOURCE" | "IGNORE" | "REACTIVATE";

export type IntegrationProcessStatus =
  | "RECEIVED"
  | "PROCESSED"
  | "FAILED"
  | "DUPLICATE";
