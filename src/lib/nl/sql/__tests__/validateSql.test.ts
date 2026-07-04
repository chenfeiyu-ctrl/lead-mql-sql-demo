import { describe, it, expect } from "vitest";
import { normalizeSqlInput, validateReadOnlySql } from "../validateSql";
import { maskSqlRows } from "../maskResults";
import { parseSqlGenerationContent } from "../generateSql";
import { canUseSqlMode, getNlSqlMode } from "../config";

describe("validateReadOnlySql", () => {
  it("接受合法 SELECT", () => {
    const r = validateReadOnlySql(
      "SELECT channel, COUNT(*) AS cnt FROM leads GROUP BY channel ORDER BY cnt DESC LIMIT 10"
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sql).toContain("LIMIT 10");
      expect(r.sql.toLowerCase()).toContain("from leads");
    }
  });

  it("自动追加 LIMIT", () => {
    const r = validateReadOnlySql("SELECT id FROM leads");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sql).toMatch(/LIMIT 100$/i);
      expect(r.notes.some((n) => n.includes("LIMIT"))).toBe(true);
    }
  });

  it("拒绝 DELETE", () => {
    const r = validateReadOnlySql("DELETE FROM leads");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("SELECT");
  });

  it("拒绝非白名单表", () => {
    const r = validateReadOnlySql("SELECT * FROM sqlite_master LIMIT 1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/不允许|系统表/);
  });

  it("拒绝多语句", () => {
    const r = validateReadOnlySql("SELECT 1; SELECT 2 FROM leads LIMIT 1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("多条");
  });

  it("拒绝 PRAGMA", () => {
    const r = validateReadOnlySql("PRAGMA table_info(leads)");
    expect(r.ok).toBe(false);
  });

  it("允许 JOIN 白名单表", () => {
    const r = validateReadOnlySql(
      "SELECT l.channel, su.name FROM leads l JOIN sales_users su ON l.owner_id = su.id LIMIT 5"
    );
    expect(r.ok).toBe(true);
  });

  it("normalizeSqlInput 去掉注释", () => {
    const sql = normalizeSqlInput("SELECT id FROM leads -- drop table\nLIMIT 1");
    expect(sql).not.toContain("--");
    expect(sql).toContain("LIMIT 1");
  });
});

describe("maskSqlRows", () => {
  it("脱敏 phone 列", () => {
    const rows = maskSqlRows([{ phone: "13800000001", name: "张三" }]);
    expect(rows[0].phone).toBe("138****0001");
    expect(rows[0].name).toBe("张三");
  });
});

describe("parseSqlGenerationContent", () => {
  it("解析合法 JSON", () => {
    const r = parseSqlGenerationContent(
      '{"sql":"SELECT id FROM leads LIMIT 1","summary":"查一条"}'
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary).toBe("查一条");
  });
});

describe("config", () => {
  it("默认 off", () => {
    const prev = process.env.NL_SQL_MODE;
    delete process.env.NL_SQL_MODE;
    expect(getNlSqlMode()).toBe("off");
    expect(canUseSqlMode("sql")).toBe(false);
    process.env.NL_SQL_MODE = prev;
  });
});
