"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, Badge, Button, Modal, Toast } from "@/components/ui";
import { SALES_ROLE_LABEL, SALES_ROLE_VALUES } from "@/lib/enums";

interface SalesUser {
  id: string;
  name: string;
  role: string;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
}

type FormState = {
  name: string;
  role: (typeof SALES_ROLE_VALUES)[number];
  department: string;
  email: string;
  phone: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  role: "SALES",
  department: "",
  email: "",
  phone: "",
  isActive: true,
});

export default function SalesUsersPage() {
  const [users, setUsers] = useState<SalesUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; user: SalesUser } | null>(
    null
  );
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const flash = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<SalesUser[]>("/api/sales-users?all=1");
    if (res.ok) setUsers(res.data);
    else flash("error", res.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setDialog({ mode: "create" });
  };

  const openEdit = (user: SalesUser) => {
    setForm({
      name: user.name,
      role: user.role as FormState["role"],
      department: user.department ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      isActive: user.isActive,
    });
    setDialog({ mode: "edit", user });
  };

  const submit = async () => {
    if (!form.name.trim()) {
      flash("error", "请填写姓名");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      role: form.role,
      department: form.department.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    };

    const res =
      dialog?.mode === "create"
        ? await api.post<SalesUser>("/api/sales-users", payload)
        : await api.patch<SalesUser>(`/api/sales-users/${dialog!.user.id}`, {
            ...payload,
            isActive: form.isActive,
          });

    setSaving(false);
    if (res.ok) {
      flash("success", dialog?.mode === "create" ? "已新增成员" : "已保存修改");
      setDialog(null);
      load();
    } else {
      flash("error", res.error.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">销售团队</h1>
          <p className="mt-1 text-sm text-slate-500">维护负责人列表，用于线索分配与操作人选择。</p>
        </div>
        <Button onClick={openCreate}>+ 新增成员</Button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-500">暂无成员，请点击「新增成员」。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">姓名</th>
                <th className="py-2">角色</th>
                <th className="py-2">部门</th>
                <th className="py-2">邮箱</th>
                <th className="py-2">状态</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{u.name}</td>
                  <td className="py-2">
                    <Badge color="blue">{SALES_ROLE_LABEL[u.role] ?? u.role}</Badge>
                  </td>
                  <td className="py-2 text-slate-600">{u.department ?? "-"}</td>
                  <td className="py-2 text-slate-600">{u.email ?? "-"}</td>
                  <td className="py-2">
                    {u.isActive ? (
                      <Badge color="green">启用</Badge>
                    ) : (
                      <Badge color="slate">已停用</Badge>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                      编辑
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={!!dialog}
        title={dialog?.mode === "create" ? "新增成员" : "编辑成员"}
        onClose={() => setDialog(null)}
      >
        <label className="mb-1 block text-sm font-medium text-slate-700">姓名</label>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="例如：李销售"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">角色</label>
        <select
          value={form.role}
          onChange={(e) =>
            setForm((f) => ({ ...f, role: e.target.value as FormState["role"] }))
          }
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {SALES_ROLE_VALUES.map((r) => (
            <option key={r} value={r}>
              {SALES_ROLE_LABEL[r]}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700">部门</label>
        <input
          value={form.department}
          onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="例如：销售一部"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">邮箱（可选）</label>
        <input
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="name@company.com"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">手机（可选）</label>
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        {dialog?.mode === "edit" && (
          <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            启用（停用后不会出现在线索分配下拉框）
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialog(null)}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </Modal>

      <Toast toast={toast} />
    </div>
  );
}
