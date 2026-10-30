import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox, MessageCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { etapasDoKanban, kanbanDoModuloOrcamentos } from "@/lib/orcamento-kanban";
import { SITUACOES } from "@/lib/orcamentos";
import { CaptacaoLeadsDialog } from "@/components/orcamentos/CaptacaoLeadsDialog";
import { ReguaOfertas } from "@/components/orcamentos/ReguaOfertas";
import { ConfigAprovacaoOfertaDialog } from "@/components/orcamentos/AprovacaoOfertas";
import { ConfigAprovacaoDialog } from "@/components/cotacoes/AprovacaoCompras";
import { ModelosMensagemButton } from "@/components/layout/ModelosMensagem";

/** Aba de configuração: cartão compacto que abre a tela de ajuste existente. Acesso pela função filha. */
function Painel({ path, icone, titulo, texto, children }: { path: string; icone: ReactNode; titulo: string; texto: string; children: (editar: boolean) => ReactNode }) {
  const p = usePagePermissions(path);
  if (p.loading) return null;
  if (!p.canRead) return <p className="text-muted-foreground text-sm">Você não tem acesso a esta aba.</p>;
  return (
    <div className="max-w-2xl rounded-lg border bg-card p-5">
      <div className="mb-1 flex items-center gap-2 font-semibold">{icone}{titulo}</div>
      <p className="mb-4 text-sm text-muted-foreground">{texto}</p>
      {children(p.canUpdate || p.canCreate)}
    </div>
  );
}

export function AbaCaptacaoLeads() {
  const [open, setOpen] = useState(false);
  return (
    <Painel path="/orcamentos/captacao" icone={<Inbox className="h-4 w-4" />} titulo="Captação de leads" texto="Endereço para o site e anúncios enviarem contatos direto para as Ofertas.">
      {(editar) => (<><Button onClick={() => setOpen(true)}>Abrir captação</Button><CaptacaoLeadsDialog open={open} onOpenChange={setOpen} canEdit={editar} /></>)}
    </Painel>
  );
}

export function AbaReguaOfertas() {
  const [open, setOpen] = useState(false);
  const { data: etapas = [] } = useQuery({ queryKey: ["orcamentos-etapas-kanban"], queryFn: async () => etapasDoKanban(await kanbanDoModuloOrcamentos()) });
  const situacoes = etapas.length ? etapas.map((e) => e.descricao) : SITUACOES.map((s) => String(s.value));
  return (
    <Painel path="/orcamentos/regua" icone={<MessageCircle className="h-4 w-4" />} titulo="Régua de acompanhamento" texto="Mensagens automáticas de acompanhamento das ofertas enviadas.">
      {(editar) => (<><Button onClick={() => setOpen(true)}>Abrir régua</Button><ReguaOfertas open={open} onOpenChange={setOpen} canEdit={editar} situacoes={situacoes} /></>)}
    </Painel>
  );
}

export function AbaWorkflowOfertas() {
  const [open, setOpen] = useState(false);
  return (
    <Painel path="/orcamentos/workflow" icone={<ShieldCheck className="h-4 w-4" />} titulo="Workflow de aprovação" texto="Quem aprova as ofertas e em quais condições.">
      {(editar) => (<><Button disabled={!editar} onClick={() => setOpen(true)}>Configurar aprovação</Button><ConfigAprovacaoOfertaDialog open={open} onOpenChange={setOpen} /></>)}
    </Painel>
  );
}

export function AbaWorkflowCompras() {
  const [open, setOpen] = useState(false);
  return (
    <Painel path="/cotacoes/workflow" icone={<ShieldCheck className="h-4 w-4" />} titulo="Workflow de aprovação" texto="Quem aprova as compras e em quais condições.">
      {(editar) => (<><Button disabled={!editar} onClick={() => setOpen(true)}>Configurar aprovação</Button><ConfigAprovacaoDialog open={open} onOpenChange={setOpen} /></>)}
    </Painel>
  );
}

export function AbaTextosWhatsapp() {
  const { empresaId } = useAudit();
  return (
    <Painel path="/cotacoes/textos-whatsapp" icone={<MessageSquareText className="h-4 w-4" />} titulo="Textos do WhatsApp" texto="Mensagens enviadas automaticamente aos fornecedores pelo WhatsApp.">
      {(editar) => (editar ? <ModelosMensagemButton empresaId={empresaId} /> : <p className="text-sm text-muted-foreground">Somente leitura.</p>)}
    </Painel>
  );
}
