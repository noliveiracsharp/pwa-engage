import { createFileRoute } from "@tanstack/react-router";
import { ChildTable, INSTANCIAS } from "@/components/empresas/EmpresaSheet";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId } from "@/lib/crud";
import { usePagePermissions } from "@/hooks/usePagePermissions";

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

function InstanciasPage() {
  const { empresa, isMaster, empresaContextoId } = useAuth();
  const { data: empresas = [] } = useTableRows("empresas", isMaster);
  const ctx = isMaster && empresaContextoId ? empresas.find((e) => String(rowId(e)) === String(empresaContextoId)) : undefined;
  const atual = (ctx ?? empresa ?? null) as Parameters<typeof ChildTable>[0]["empresa"];
  const perms = usePagePermissions("/instancias");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Canais & Instâncias</h2>
        <p className="text-sm text-muted-foreground">Conecte o WhatsApp, gere o chat do site e gerencie os canais da empresa ativa.</p>
      </div>
      <ChildTable config={INSTANCIAS} empresa={atual} perms={{ canCreate: perms.canCreate, canUpdate: perms.canUpdate, canDelete: perms.canDelete }} />
    </div>
  );
}
