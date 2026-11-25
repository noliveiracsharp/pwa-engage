import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Loader2, MessageSquare, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CrmClientePainel } from "@/components/crm/CrmClientePainel";
import { useAudit } from "@/lib/audit";
import { rowId } from "@/lib/crud";
import { formatPhoneDisplay } from "@/lib/input-masks";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
/** Compara pelos últimos 8 dígitos (ignora DDI/DDD e o 9º dígito). */
const mesmoTelefone = (a: unknown, b: unknown) => {
  const x = digitos(a), y = digitos(b);
  return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8);
};

/** Painel único do negócio para cartões de atendimento (Lead/Qualificação): resumo, CRM do cliente, conversa e criação da Oferta. */
export function LeadKanbanSheet({
  card, pessoa, etapaNome, parceiros, onClose, onCriarOferta,
}: {
  card: Row | null; pessoa: Row | undefined; etapaNome: string; parceiros: Row[];
  onClose: () => void; onCriarOferta: (clienteId: string) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const [aba, setAba] = useState<"resumo" | "crm">("resumo");
  const [criando, setCriando] = useState(false);
  const [clienteCriadoId, setClienteCriadoId] = useState<string | null>(null);
  const nome = String(pessoa?.["nome"] ?? `Atendimento #${String(card?.["id"] ?? "")}`);
  const telefone = String(pessoa?.["telefone"] ?? "");

  const cliente = useMemo(() => {
    if (clienteCriadoId) return parceiros.find((p) => String(rowId(p)) === clienteCriadoId) ?? { id: clienteCriadoId, nome };
    if (!telefone) return null;
    return parceiros.find((p) => p["is_cliente"] === true &&
      [p["telefone1"], p["telefone2"], p["telefone"], p["celular"]].some((t) => mesmoTelefone(t, telefone))) ?? null;
  }, [parceiros, telefone, clienteCriadoId, nome]);
  const clienteId = cliente ? String(rowId(cliente) ?? cliente["id"]) : "";

  const cadastrar = async () => {
    setCriando(true);
    const payload = stamp({ nome, telefone1: telefone || null, is_cliente: true, status: true }, true);
    const { data, error } = await supabase.from("parceiros").insert(payload as never).select("id").maybeSingle();
    setCriando(false);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["table", "parceiros"] });
    if (data) setClienteCriadoId(String((data as Row)["id"]));
    toast.success("Lead cadastrado como cliente.");
  };

  const fechar = () => { setAba("resumo"); setClienteCriadoId(null); onClose(); };

  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && fechar()}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-none lg:w-[60vw]">
        <SheetHeader>
          <SheetTitle>{nome}</SheetTitle>
          <SheetDescription>{[formatPhoneDisplay(telefone), etapaNome].filter(Boolean).join(" · ")}</SheetDescription>
        </SheetHeader>
        <div role="tablist" className="flex gap-1 border-b border-border px-1">
          {([["resumo", "Resumo"], ["crm", "CRM do Cliente"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
              className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {aba === "resumo" && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border p-4 text-sm">
                <p className="text-muted-foreground">Cliente vinculado</p>
                {cliente ? (
                  <p className="font-medium text-foreground">{String(cliente["nome"] ?? cliente["razao_social"] ?? nome)}</p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Nenhum cliente com este telefone.</span>
                    <Button size="sm" variant="outline" onClick={cadastrar} disabled={criando}>
                      {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Cadastrar como cliente
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate({ to: "/atendimentos", search: { id: String(card?.["id"] ?? "") } })}>
                  <MessageSquare className="h-4 w-4" /> Abrir conversa
                </Button>
                <Button disabled={!clienteId} onClick={() => { const id = clienteId; fechar(); onCriarOferta(id); }}>
                  <FilePlus2 className="h-4 w-4" /> Criar Oferta
                </Button>
              </div>
              {!clienteId && <p className="text-xs text-muted-foreground">Cadastre o cliente para registrar interações e criar a Oferta.</p>}
            </div>
          )}
          {aba === "crm" && (clienteId
            ? <CrmClientePainel clienteId={clienteId} cliente={cliente ?? { id: clienteId }} />
            : <p className="pt-4 text-sm text-muted-foreground">Cadastre o cliente na aba Resumo para usar o CRM.</p>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}
