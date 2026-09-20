import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { matches, rowId, text, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/funcoes")({
  head: () => ({
    meta: [
      { title: "Funções — Atende.ai" },
      { name: "description", content: "Perfis de acesso e menus liberados para cada função." },
      { property: "og:title", content: "Funções — Atende.ai" },
      { property: "og:description", content: "Perfis de acesso e menus liberados para cada função." },
    ],
  }),
  component: FuncoesPage,
});

const DESCRICAO = ["descricao", "funcao_descricao", "nome", "titulo"];
const STATUS = ["status", "funcao_status", "ativo", "situacao"];

const fields: Field[] = [
  { fields: DESCRICAO, label: "Descrição", full: true },
  { fields: STATUS, label: "Status" },
];

function useMenus() {
  return useQuery({
    queryKey: ["table", "menus"],
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("menus").select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

function MenuPicker({ funcao }: { funcao: Row | null }) {
  const { data: menus = [], isError } = useMenus();
  const queryClient = useQueryClient();
  const funcaoId = rowId(funcao ?? {});
  const [selected, setSelected] = useState<string[]>([]);

  const { data: links = [] } = useQuery({
    queryKey: ["funcoes_menus", text(funcaoId)],
    enabled: Boolean(funcaoId),
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("funcoes_menus").select("*");
      if (error) throw error;
      return ((data ?? []) as Row[]).filter(
        (row) => text(pick(row, ["funcao_id", "id_funcao", "perfil_id"])) === text(funcaoId),
      );
    },
  });

  useEffect(() => {
    setSelected(links.map((row) => text(pick(row, ["menu_id", "id_menu"]))).filter(Boolean));
  }, [links]);

  if (isError || menus.length === 0) return null;

  const toggle = async (menuId: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, menuId] : prev.filter((id) => id !== menuId)));
    if (!funcaoId) return;
    try {
      if (checked) {
        const { error } = await supabase
          .from("funcoes_menus")
          .insert({ funcao_id: funcaoId, menu_id: menuId } as never);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("funcoes_menus")
          .delete()
          .eq("funcao_id", funcaoId as never)
          .eq("menu_id", menuId as never);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["funcoes_menus", text(funcaoId)] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o menu.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Menus liberados</p>
      {!funcaoId && (
        <p className="text-xs text-muted-foreground">Salve a função para liberar os menus.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {menus.map((menu, index) => {
          const id = text(pick(menu, ["id", "menu_id"], index));
          const label = text(pick(menu, ["menu_descricao", "descricao", "nome", "label"], "Menu"));
          return (
            <label key={id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(id)}
                disabled={!funcaoId}
                onCheckedChange={(v) => toggle(id, v === true)}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FuncoesPage() {
  const { data: rows = [], isLoading } = useTableRows("funcoes");
  const save = useSaveRecord("funcoes");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ descricao: "", menu: "todos", status: "todos" });

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((row) => text(pick(row, STATUS))).filter(Boolean));
    return [{ value: "todos", label: "Todos" }, ...[...set].map((s) => ({ value: s.toLowerCase(), label: s }))];
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matches(pick(row, DESCRICAO), f.descricao) &&
          (f.status === "todos" || text(pick(row, STATUS)).toLowerCase() === f.status) &&
          (f.menu === "todos" ||
            text(pick(row, ["menu_ativo", "menu", "menu_inicial", "menu_padrao"]))
              .toLowerCase()
              .includes(f.menu)),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    { key: "descricao", header: "Descrição", fields: DESCRICAO },
    { key: "menu", header: "Menu ativo", fields: ["menu_ativo", "menu", "menu_inicial", "menu_padrao"] },
    { key: "status", header: "Status", fields: STATUS },
  ];

  return (
    <>
      <DataTable
        title="Funções"
        columns={columns}
        rows={filtered}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={() => {
          setRecord(null);
          setOpen(true);
        }}
        onEdit={(row) => {
          setRecord(row);
          setOpen(true);
        }}
        filters={
          <>
            <FilterInput
              label="Descrição"
              value={f.descricao}
              onChange={(v) => setF({ ...f, descricao: v })}
            />
            <FilterInput label="Menu ativo" value={f.menu} onChange={(v) => setF({ ...f, menu: v })} />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={statusOptions}
            />
          </>
        }
      />

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title={record ? "Editar função" : "Nova função"}
        fields={fields}
        record={record}
        saving={save.isPending}
        onSave={(values) => save.mutate({ values, original: record }, { onSuccess: () => setOpen(false) })}
        extra={<MenuPicker funcao={record} />}
      />
    </>
  );
}

export { Label };
