import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChildTable, INSTANCIAS } from "@/components/empresas/EmpresaSheet";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId } from "@/lib/crud";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/instancias")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Canais & Instâncias — Atende.ai" },
      { name: "description", content: "Instâncias de WhatsApp, Instagram, Telegram e chat do site da empresa ativa." },
      { property: "og:title", content: "Canais & Instâncias — Atende.ai" },
      { property: "og:description", content: "Instâncias de WhatsApp, Instagram, Telegram e chat do site da empresa ativa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstanciasPage,
});

type Emp = Parameters<typeof ChildTable>[0]["empresa"];

function InstanciasPage() {
  const { empresa, isMaster, empresaContextoId } = useAuth();
  const { data: empresas = [] } = useTableRows("empresas");
  const perms = usePagePermissions("/instancias");
  const [escopo, setEscopo] = useState<string>("todas");

  const atualId = String(isMaster && empresaContextoId ? empresaContextoId : empresa ? rowId(empresa) : "");
  const atual = (empresas.find((e) => String(rowId(e)) === atualId) ?? empresa ?? null) as Emp;
  const filiais = useMemo(
    () => empresas.filter((e) => atualId && String(e["empresa_pai_id"] ?? "") === atualId),
    [empresas, atualId],
  );
  const unidades = atual ? [atual, ...filiais] : filiais;
  const temFiliais = filiais.length > 0;
  const p = { canCreate: perms.canCreate, canUpdate: perms.canUpdate, canDelete: perms.canDelete };
  const nome = (e: NonNullable<Emp>) => String(e["nome_fantasia"] || e["nome"] || e["razao_social"] || "Empresa");

  const visiveis = !temFiliais ? (atual ? [atual] : []) : escopo === "todas" ? unidades : unidades.filter((u) => String(rowId(u!)) === escopo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Canais & Instâncias</h2>
          <p className="text-sm text-muted-foreground">Conecte o WhatsApp, gere o chat do site e gerencie os canais da empresa.</p>
        </div>
        {temFiliais && (
          <Select value={escopo} onValueChange={setEscopo}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as unidades</SelectItem>
              {unidades.map((u, i) => (
                <SelectItem key={String(rowId(u!))} value={String(rowId(u!))}>
                  {i === 0 ? `${nome(u!)} (matriz)` : nome(u!)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {visiveis.map((u) => (
        <section key={String(rowId(u!))} className="space-y-2">
          {temFiliais && <h3 className="text-sm font-semibold text-muted-foreground">Unidade: {nome(u!)}</h3>}
          <ChildTable config={INSTANCIAS} empresa={u} perms={p} />
        </section>
      ))}
    </div>
  );
}
