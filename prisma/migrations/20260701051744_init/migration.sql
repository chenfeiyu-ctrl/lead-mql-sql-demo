-- CreateTable
CREATE TABLE "sales_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "first_source" TEXT NOT NULL,
    "first_channel" TEXT NOT NULL,
    "latest_source" TEXT NOT NULL,
    "latest_channel" TEXT NOT NULL,
    "lead_level" TEXT NOT NULL DEFAULT 'C',
    "main_status" TEXT NOT NULL,
    "call_status" TEXT NOT NULL DEFAULT 'NOT_CALLED',
    "wechat_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "follow_status" TEXT NOT NULL DEFAULT 'NOT_FOLLOWED',
    "owner_id" TEXT,
    "assigned_at" DATETIME,
    "call_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_follow_up_at" DATETIME,
    "first_follow_up_at" DATETIME,
    "mql_at" DATETIME,
    "mql_reason" TEXT,
    "sql_at" DATETIME,
    "sql_reason" TEXT,
    "sql_revoked_at" DATETIME,
    "sql_revoke_reason" TEXT,
    "invalid_reason" TEXT,
    "import_batch_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "sales_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "leads_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "call_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lead_id" TEXT NOT NULL,
    "call_attempt_no" INTEGER NOT NULL,
    "call_status" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "invalid_reason" TEXT,
    "source_system" TEXT,
    "external_event_id" TEXT,
    "called_at" DATETIME NOT NULL,
    "operator_id" TEXT,
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_records_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "follow_up_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lead_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intention_level" TEXT NOT NULL,
    "next_action" TEXT,
    "next_follow_up_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follow_up_records_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "follow_up_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "sales_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lead_status_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lead_id" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "operator_id" TEXT,
    "trigger_source" TEXT NOT NULL,
    "reason" TEXT,
    "related_record_type" TEXT,
    "related_record_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_status_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lead_status_logs_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "sales_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lead_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "due_at" DATETIME,
    "resolved_at" DATETIME,
    "resolved_by" TEXT,
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "duplicate_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lead_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "new_source" TEXT NOT NULL,
    "new_channel" TEXT NOT NULL,
    "action" TEXT,
    "import_batch_id" TEXT,
    "detected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT,
    CONSTRAINT "duplicate_records_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "duplicate_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_summary" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);

-- CreateTable
CREATE TABLE "integration_event_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_system" TEXT NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "lead_id" TEXT,
    "payload" TEXT NOT NULL,
    "process_status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error_message" TEXT,
    "processed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_users_email_key" ON "sales_users"("email");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_main_status_idx" ON "leads"("main_status");

-- CreateIndex
CREATE INDEX "leads_owner_id_idx" ON "leads"("owner_id");

-- CreateIndex
CREATE INDEX "leads_channel_idx" ON "leads"("channel");

-- CreateIndex
CREATE INDEX "leads_mql_at_idx" ON "leads"("mql_at");

-- CreateIndex
CREATE INDEX "leads_sql_at_idx" ON "leads"("sql_at");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "call_records_lead_id_idx" ON "call_records"("lead_id");

-- CreateIndex
CREATE INDEX "call_records_called_at_idx" ON "call_records"("called_at");

-- CreateIndex
CREATE INDEX "follow_up_records_lead_id_idx" ON "follow_up_records"("lead_id");

-- CreateIndex
CREATE INDEX "follow_up_records_created_at_idx" ON "follow_up_records"("created_at");

-- CreateIndex
CREATE INDEX "lead_status_logs_lead_id_idx" ON "lead_status_logs"("lead_id");

-- CreateIndex
CREATE INDEX "lead_status_logs_created_at_idx" ON "lead_status_logs"("created_at");

-- CreateIndex
CREATE INDEX "tasks_task_type_status_idx" ON "tasks"("task_type", "status");

-- CreateIndex
CREATE INDEX "tasks_lead_id_idx" ON "tasks"("lead_id");

-- CreateIndex
CREATE INDEX "duplicate_records_phone_idx" ON "duplicate_records"("phone");

-- CreateIndex
CREATE INDEX "duplicate_records_lead_id_idx" ON "duplicate_records"("lead_id");

-- CreateIndex
CREATE INDEX "integration_event_logs_lead_id_idx" ON "integration_event_logs"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_event_logs_source_system_external_event_id_key" ON "integration_event_logs"("source_system", "external_event_id");
