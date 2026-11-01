import { useEffect, useRef, useState } from "react";
import { FileText, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { executarFluxo, proximoNoId, type Acao, type ConexaoFluxo, type EstadoExec, type NoFluxo } from "@/lib/fluxos-motor";
import { executarCodigo, executarHttp } from "@/lib/fluxos-externo";
import { nomeTipo, type TipoNo } from "@/lib/fluxos";
import { cn } from "@/lib/utils";

type Balao = { de: "cliente" | "robo" | "sistema"; texto: string; midiaUrl?: string | undefined; midiaTipo?: string | undefined };
export type PassoTrilha = { id: string; titulo: string };

/** Testa o fluxo no navegador: nada é enviado ao WhatsApp nem gravado no banco. */
export function SimuladorFluxo({ open, onOpenChange, nos, conexoes, onTrilha }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  nos: NoFluxo[]; conexoes: ConexaoFluxo[];
  onTrilha: (visitados: string[], atual: string | null) => void;
}) {
  const [baloes, setBaloes] = useState<Balao[]>([]);
  const [estado, setEstado] = useState<EstadoExec | null>(null);
  const [trilha, setTrilha] = useState<PassoTrilha[]>([]);
  const [texto, setTexto] = useState("");
  const [rodando, setRodando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const nomeNo = (id: string) => {
    const n = nos.find((x) => x.id === id);
    return n ? String(n.data.titulo || nomeTipo((n.data.tipo ?? n.type) as TipoNo)) : id;
  };

  const reiniciar = () => {
    setBaloes([]); setEstado(null); setTrilha([]); setTexto(""); onTrilha([], null);
  };
  useEffect(() => { if (!open) onTrilha([], null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }); }, [baloes]);

  const aplicar = (acoes: Acao[], novos: Balao[]) => {
    for (const a of acoes) {
      if (a.tipo === "mensagem") novos.push({ de: "robo", texto: a.texto, midiaUrl: a.midiaUrl, midiaTipo: a.midiaTipo });
      else if (a.tipo === "atraso") novos.push({ de: "sistema", texto: `Aguardaria ${a.segundos}s` });
      else if (a.tipo === "etapa") novos.push({ de: "sistema", texto: "Moveria o card no Kanban" });
      else if (a.tipo === "modo") novos.push({ de: "sistema", texto: a.modo === "Humano" ? "Transferiria para um atendente" : "Robô assume a conversa" });
      else if (a.tipo === "campo") novos.push({ de: "sistema", texto: `Gravaria o campo ${a.chave} = ${a.valor}` });
      else if (a.tipo === "encerrar") novos.push({ de: "sistema", texto: "Encerraria o atendimento" });
    }
  };

  const enviar = async () => {
    const msg = texto.trim();
    if (!msg || rodando) return;
    if (estado && (estado.status === "finalizado" || estado.status === "transbordo")) {
      setBaloes((b) => [...b, { de: "sistema", texto: "O fluxo já terminou. Clique em Reiniciar para testar de novo." }]);
      return;
    }
    setRodando(true);
    setTexto("");
    const novos: Balao[] = [{ de: "cliente", texto: msg }];
    const ini: EstadoExec = estado ?? { no_atual: null, status: "ativo", variaveis: { protocolo: "2026-000123", nome: "Cliente Teste", telefone: "5511999999999" } };
    let res = executarFluxo({ nos, conexoes, estado: ini, texto: msg });
    const visitados = [...trilha.map((t) => t.id), ...(res.trilha ?? [])];
    aplicar(res.acoes, novos);
    for (let passos = 0; res.externo && passos < 20; passos++) {
      const no = res.externo.no;
      const tipo = (no.data.tipo ?? no.type) as TipoNo;
      let saida: string; let vars = res.estado.variaveis;
      if (tipo === "http") {
        const r = await executarHttp(no.data, vars); saida = r.saida; vars = r.variaveis;
        if (r.erro) novos.push({ de: "sistema", texto: `API falhou: ${r.erro} (no teste, o navegador pode bloquear APIs que funcionam no servidor)` });
      } else if (tipo === "codigo") {
        const r = executarCodigo(no.data, vars); saida = r.saida; vars = r.variaveis;
        if (r.erro) novos.push({ de: "sistema", texto: `Erro no JavaScript: ${r.erro}` });
      } else {
        novos.push({ de: "robo", texto: "(Resposta da IA — no teste não é gerada)" });
        saida = "respondeu";
      }
      const prox = proximoNoId(conexoes, no.id, saida);
      if (!prox) {
        const continua = tipo === "ia";
        res = { acoes: [], estado: { no_atual: continua ? no.id : null, status: continua ? "aguardando" : "finalizado", variaveis: vars } };
        break;
      }
      res = executarFluxo({ nos, conexoes, estado: { no_atual: prox, status: "ativo", variaveis: vars }, texto: msg });
      visitados.push(...(res.trilha ?? []));
      aplicar(res.acoes, novos);
    }
    if (res.subfluxo) novos.push({ de: "sistema", texto: "Continuaria em outro fluxo (teste esse fluxo separadamente)" });
    if (res.estado.status === "finalizado" && !res.subfluxo) novos.push({ de: "sistema", texto: "Fim do fluxo" });
    setBaloes((b) => [...b, ...novos]);
    setEstado(res.estado);
    setTrilha(visitados.map((id) => ({ id, titulo: nomeNo(id) })));
    onTrilha(visitados, res.estado.status === "aguardando" ? res.estado.no_atual : null);
    setRodando(false);
  };

  const vars = Object.entries(estado?.variaveis ?? {});
  const statusTxt: Record<EstadoExec["status"], string> = { ativo: "Em execução", aguardando: "Aguardando resposta", finalizado: "Finalizado", transbordo: "Com atendente" };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Testar fluxo</SheetTitle>
          <SheetDescription>Converse como se fosse o cliente. Nada é enviado de verdade.</SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-between px-4 text-xs text-muted-foreground">
          <span>
            {estado ? statusTxt[estado.status] : "Envie uma mensagem para começar"}
            {estado?.status === "aguardando" && estado.no_atual ? ` · em "${nomeNo(estado.no_atual)}"` : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={reiniciar}><RotateCcw className="size-3.5" /> Reiniciar</Button>
        </div>
        <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col px-4">
          <TabsList className="w-fit">
            <TabsTrigger value="chat">Conversa</TabsTrigger>
            <TabsTrigger value="dados">Dados ({vars.length})</TabsTrigger>
            <TabsTrigger value="etapas">Etapas ({trilha.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3">
              {baloes.map((b, i) => b.de === "sistema" ? (
                <p key={i} className="text-center text-[11px] text-muted-foreground">— {b.texto} —</p>
              ) : (
                <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm", b.de === "cliente" ? "ml-auto bg-primary text-primary-foreground" : "bg-card")}>
                  {b.midiaUrl && b.midiaTipo === "imagem" && <img src={b.midiaUrl} alt="" className="mb-1 max-h-48 rounded" />}
                  {b.midiaUrl && b.midiaTipo === "video" && <video src={b.midiaUrl} controls className="mb-1 max-h-48 rounded" />}
                  {b.midiaUrl && b.midiaTipo === "documento" && <a href={b.midiaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 underline"><FileText className="size-4" /> Arquivo</a>}
                  {b.texto}
                </div>
              ))}
              <div ref={fimRef} />
            </div>
            <form className="flex gap-2 pb-4" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite como o cliente…" disabled={rodando} />
              <Button type="submit" size="icon" disabled={rodando || !texto.trim()} aria-label="Enviar"><Send className="size-4" /></Button>
            </form>
          </TabsContent>
          <TabsContent value="dados" className="min-h-0 flex-1 overflow-y-auto pb-4">
            {vars.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum dado ainda.</p> : (
              <table className="w-full text-xs">
                <tbody>
                  {vars.map(([k, v]) => (
                    <tr key={k} className="border-b align-top">
                      <td className="py-1.5 pr-2 font-mono font-medium">{`{{${k}}}`}</td>
                      <td className="break-all py-1.5 font-mono text-muted-foreground">{v.length > 400 ? `${v.slice(0, 400)}…` : v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>
          <TabsContent value="etapas" className="min-h-0 flex-1 overflow-y-auto pb-4">
            <ol className="space-y-1 text-sm">
              {trilha.map((t, i) => <li key={i} className="rounded border px-2 py-1"><span className="text-muted-foreground">{i + 1}.</span> {t.titulo}</li>)}
            </ol>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
