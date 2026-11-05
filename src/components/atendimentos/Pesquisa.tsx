import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { filterPayload, useCols } from "@/lib/projetos";
import { useAudit } from "@/lib/audit";
import { A, telefonePessoa } from "@/lib/atendimentos";
import { dispararMensagem, marcarEnvio } from "@/lib/atendimentos-envio";
import { CSAT_AGRADECIMENTO_PADRAO, CSAT_OPCOES } from "@/lib/csat";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const TEXTO_PESQUISA =
  "O seu atendimento foi encerrado. Por favor, avalie o nosso suporte respondendo com uma nota de 1 a 5.";

/** Mensagem de encerramento com protocolo e link do portal do cliente. */
export function textoEncerramento(protocolo: unknown, telefone: string, origem: string): string {
  const prot = text(protocolo);
  const tel = telefone.replace(/\D/g, "");
  const linhas = ["O seu atendimento foi encerrado."];
  if (prot) linhas.push(`Protocolo: ${prot}`);
  if (tel && origem) linhas.push(`Consulte seus protocolos em: ${origem}/portal?tel=${tel}`);
  linhas.push("", "Sua avaliação é muito importante para melhorarmos nosso atendimento. Toque em \"Avaliar\" e escolha uma nota de 1 a 5.");
  return linhas.join("\n");
}

export function notaDe(a: Row | undefined): number {
  const n = Number(pick(a, ["nota"]) ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0;
}

/** Estrelas quando há nota; selo "Aguardando Avaliação" quando encerrado sem nota. */
export function AvaliacaoSelo({ atendimento, encerrado }: { atendimento: Row; encerrado: boolean }) {
  const nota = notaDe(atendimento);
  if (nota > 0) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`Avaliação ${nota} de 5`} title={`Avaliação ${nota}/5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={i <= nota ? "h-3 w-3 fill-warning text-warning" : "h-3 w-3 text-muted-foreground/40"} />
        ))}
      </span>
    );
  }
  if (!encerrado) return null;
  return (
    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">
      Aguardando Avaliação
    </Badge>
  );
}

type Pedido = { atendimento: Row; pessoa?: Row | undefined; instancia?: Row | undefined; executar: () => Promise<boolean> };

/** Pergunta se envia a pesquisa ao encerrar; executa o movimento e, se confirmado, envia. */
export function usePesquisaSatisfacao() {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const { data: colsMsg } = useCols("atendimentos_mensagem");
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [agradecimento, setAgradecimento] = useState("");
  const agradOriginal = useRef("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  function pedir(p: Pedido): Promise<boolean> {
    setPedido(p);
    if (empresaId) {
      void supabase.from("empresas").select("*").eq("id", empresaId).maybeSingle().then(({ data }) => {
        const v = String((data as Row | null)?.["csat_msg_agradecimento"] ?? "");
        agradOriginal.current = v;
        setAgradecimento(v || CSAT_AGRADECIMENTO_PADRAO);
      });
    } else setAgradecimento(CSAT_AGRADECIMENTO_PADRAO);
    return new Promise((res) => { resolver.current = res; });
  }

  async function enviarPesquisa(p: Pedido) {
    const atId = text(pick(p.atendimento, ["id"]));
    const instId = pick(p.atendimento, A.instancia);
    let instancia = p.instancia;
    if (!instancia && instId != null) {
      const { data } = await supabase.from("empresas_instancias").select("*").eq("id", instId as string).maybeSingle();
      instancia = (data ?? undefined) as Row | undefined;
    }
    let pessoa = p.pessoa;
    const pesId = pick(p.atendimento, A.pessoa);
    if (!pessoa && pesId != null) {
      const { data } = await supabase.from("pessoas").select("*").eq("id", pesId as string).maybeSingle();
      pessoa = (data ?? undefined) as Row | undefined;
    }
    const TEXTO = textoEncerramento(pick(p.atendimento, ["protocolo"]), telefonePessoa(pessoa), typeof window !== "undefined" ? window.location.origin : "");
    const payload: Row = {
      atendimento_id: atId, mensagem: TEXTO, conteudo: TEXTO, texto: TEXTO,
      tipo: "texto", msg_interna: false, from_me: true, direcao: "saida", remetente_tipo: "atendente",
      usuario_id: usuarioId, empresa_id: empresaId, instancia_id: instId, status_envio: "pendente",
    };
    const { data: salva, error } = await supabase
      .from("atendimentos_mensagem").insert(filterPayload(payload, colsMsg)).select().single();
    if (error) { toast.error(`Não foi possível registrar a pesquisa: ${error.message}`); return; }
    // Nova pesquisa: limpa a nota anterior até o cliente responder.
    if (atId) {
      await supabase.from("atendimentos").update({ nota: null } as Row).eq("id", atId);
      qc.invalidateQueries({ queryKey: ["table", "atendimentos"] });
    }
    const mid = (salva as Row | null)?.["id"];
    try {
      await dispararMensagem({ instancia, mensagemId: mid, atendimentoId: atId, telefone: telefonePessoa(pessoa), texto: TEXTO, lista: { titulo: "Avalie nosso atendimento", botao: "Avaliar", opcoes: CSAT_OPCOES } });
      await marcarEnvio(mid, "enviado");
      toast.success("Pesquisa de satisfação enviada.");
    } catch (e) {
      await marcarEnvio(mid, "falha");
      toast.error(`Pesquisa salva, mas o envio falhou: ${(e as Error).message}`);
    }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem"] });
  }

  async function concluir(enviar: boolean | null) {
    const p = pedido;
    if (!p) return;
    if (enviar === null) {
      setPedido(null);
      resolver.current?.(false);
      return;
    }
    setOcupado(true);
    const novo = agradecimento.trim() === CSAT_AGRADECIMENTO_PADRAO ? "" : agradecimento.trim();
    if (empresaId && novo !== agradOriginal.current.trim()) {
      const { error } = await supabase.from("empresas").update({ csat_msg_agradecimento: novo || null } as never).eq("id", empresaId);
      if (error) toast.error(`Não foi possível salvar a mensagem pós-avaliação: ${error.message}`);
    }
    const ok = await p.executar();
    if (ok && enviar) await enviarPesquisa(p);
    setOcupado(false);
    setPedido(null);
    resolver.current?.(ok);
  }

  const dialog = (
    <Dialog open={pedido !== null} onOpenChange={(o) => { if (!o && !ocupado) void concluir(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encerrar atendimento</DialogTitle>
          <DialogDescription>O cliente receberá o protocolo, o link do portal e a pesquisa de satisfação.</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {pedido ? textoEncerramento(pick(pedido.atendimento, ["protocolo"]), telefonePessoa(pedido.pessoa), typeof window !== "undefined" ? window.location.origin : "") : TEXTO_PESQUISA}
        </p>
        <p className="text-xs text-muted-foreground">O cliente recebe as opções de 1 a 5 para tocar. Ao responder, a nota fica neste atendimento e nenhum atendimento novo é aberto.</p>
        <div className="space-y-1.5">
          <Label htmlFor="csat-agradecimento">Mensagem enviada após a avaliação</Label>
          <Textarea id="csat-agradecimento" rows={3} value={agradecimento} onChange={(e) => setAgradecimento(e.target.value)} />
          <p className="text-xs text-muted-foreground">Fica salva para os próximos encerramentos.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={ocupado} onClick={() => concluir(null)}>Cancelar</Button>
          <Button disabled={ocupado} onClick={() => concluir(true)}>Encerrar e enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { pedir, dialog };
}
