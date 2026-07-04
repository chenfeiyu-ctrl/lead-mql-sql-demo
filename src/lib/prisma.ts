import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "error" },
            { emit: "stdout", level: "warn" },
          ]
        : [{ emit: "event", level: "error" }],
  });

  // 幂等回调依赖唯一约束冲突（source_system + external_event_id）来判定重复，
  // 该冲突已被 handleIntegrationEvent 捕获处理，属正常流程，无需打印到终端。
  client.$on("error", (e) => {
    const msg = e.message ?? "";
    const isIdempotencyConflict =
      msg.includes("Unique constraint failed") && msg.includes("external_event_id");
    if (isIdempotencyConflict) return;
    console.error("[prisma]", msg);
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
