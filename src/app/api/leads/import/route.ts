import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleRouteError } from "@/lib/apiResponse";
import { parseCsv } from "@/lib/csv";
import { intakeLeadTx } from "@/lib/leadIntake";
import { LEAD_LEVEL_VALUES } from "@/lib/enums";

const schema = z.object({
  filename: z.string().optional(),
  content: z.string().min(1, "CSV 内容为空"),
  operatorId: z.string().optional().nullable(),
});

interface RowResult {
  row: number;
  name: string;
  phone: string;
  outcome: "created" | "reactivated" | "duplicate" | "failed";
  message?: string;
}

// POST /api/leads/import —— CSV 批量导入（逐行校验 + 去重）
export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const records = parseCsv(body.content);

    if (records.length === 0) {
      return fail("VALIDATION_ERROR", "CSV 无有效数据行（需含表头 name,phone,source,channel,lead_level）");
    }

    const batch = await prisma.importBatch.create({
      data: {
        filename: body.filename ?? "upload.csv",
        totalCount: records.length,
        status: "processing",
      },
    });

    const results: RowResult[] = [];
    let success = 0;
    let duplicate = 0;
    let failed = 0;

    // 逐行处理（各行独立事务，避免单行失败回滚整批）
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const name = r.name || r["姓名"] || "";
      const phone = r.phone || r["手机号"] || "";
      const source = r.source || r["来源"] || "CSV导入";
      const channel = r.channel || r["渠道"] || "";
      const levelRaw = (r.lead_level || r["等级"] || "").toUpperCase();
      const leadLevel = (LEAD_LEVEL_VALUES as string[]).includes(levelRaw) ? levelRaw : "C";

      try {
        const res = await prisma.$transaction((tx) =>
          intakeLeadTx(tx, {
            name: name || null,
            phone,
            source,
            channel: channel || "未知",
            leadLevel,
            importBatchId: batch.id,
            triggerSource: "IMPORT",
            operatorId: body.operatorId ?? null,
          })
        );

        if (res.outcome === "created") {
          success++;
          results.push({ row: i + 1, name, phone, outcome: "created" });
        } else if (res.outcome === "reactivated") {
          success++;
          results.push({
            row: i + 1,
            name,
            phone,
            outcome: "reactivated",
            message: `重新激活（原状态 ${res.previousStatus}，已进入待外呼）`,
          });
        } else if (res.outcome === "duplicate") {
          duplicate++;
          results.push({
            row: i + 1,
            name,
            phone,
            outcome: "duplicate",
            message: `重复（原状态 ${res.existing.mainStatus}，建议 ${res.suggestion}）`,
          });
        } else {
          failed++;
          results.push({ row: i + 1, name, phone, outcome: "failed", message: res.reason });
        }
      } catch (e) {
        failed++;
        results.push({
          row: i + 1,
          name,
          phone,
          outcome: "failed",
          message: e instanceof Error ? e.message : "未知错误",
        });
      }
    }

    const updated = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        successCount: success,
        duplicateCount: duplicate,
        failedCount: failed,
        status: "done",
        finishedAt: new Date(),
        errorSummary: failed > 0 ? `${failed} 行失败` : null,
      },
    });

    return ok({ batch: updated, results });
  } catch (err) {
    return handleRouteError(err);
  }
}
