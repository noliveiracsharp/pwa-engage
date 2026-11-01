import { useEffect, useRef, useState } from "react";
import { FileText, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextoWhatsapp } from "@/components/ui/texto-whatsapp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { executarFluxo, proximoNoId, type Acao, type ConexaoFluxo, type EstadoExec, type NoFluxo } from "@/lib/fluxos-motor";
import { detectarComando, mensagemComando, COMANDOS_PADRAO, MENSAGENS_PADRAO } from "@/lib/comandos-fluxo";
import { executarCodigo, executarHttp } from "@/lib/fluxos-externo";
import { nomeTipo, type TipoNo } from "@/lib/fluxos";
import { cn } from "@/lib/utils";

type Balao = { de: "cliente" | "robo" | "sistema"; texto: string; midiaUrl?: string | undefined; midiaTipo?: string | undefined };
export type PassoTrilha = { id: string; titulo: string };

/** Testa o fluxo no navegador: nada é enviado ao WhatsApp nem gravado no banco. */
export function SimuladorFluxo({ open, onOpenChange, nos, conexoes, onTrilha, onSelecionar }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  nos: NoFluxo[]; conexoes: ConexaoFluxo[];
  onSelecionar?: (id: string) => void;
  onTrilha: (visitados: string[], atual: string | null, extra?: { erro?: { id: string; msg: string } | null; entradas?: Record<string, Record<string, string>> }) => void;
}) {
  const [entradas, setEntradas] = useState<Record<string, Record<string, string>>>({});
  const [baloes, setBaloes] = useState<Balao[]>([]);
  const [estado, setEstado] = useState<EstadoExec | null>(null);
  const [trilha, setTrilha] = useState<PassoTrilha[]>([]);
  const [texto, setTexto] = useState("");
  const [rodando, setRodando] = useState(false);
  const [erroNo, setErroNo] = useState<{ id: string; msg: string } | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const nomeNo = (id: string) => {
    const n = nos.find((x) => x.id === id);
    return n ? String(n.data.titulo || nomeTipo((n.data.tipo ?? n.type) as TipoNo)) : id;
  };

  const reiniciar = () => {
    setBaloes([]); setEstado(null); setTrilha([]); setTexto(""); setEntradas({}); setErroNo(null); onTrilha([], null, { erro: null, entradas: {} });
  };
  useEffect(() => { if (!open) onTrilha([], null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }); }, [baloes]);

  const aplicar = (acoes: Acao[], novos: Balao[]) => {
    for (const a of acoes) {
      if (a.tipo === "mensagem") novos.push({ de: "robo", texto: a.lista ? [a.texto, `📋 ${a.lista.botao}`, ...a.lista.opcoes.map((o, i) => `${i + 1}. ${o}`)].filter(Boolean).join("\n") : a.texto, midiaUrl: a.midiaUrl, midiaTipo: a.midiaTipo });
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
    const cfgCmd = nos.find((n) => (n.data.tipo ?? n.type) === "gatilho")?.data ?? {};
    const comando = detectarComando(msg, cfgCmd);
    if (comando === "atendente" || comando === "sair") {
      setTexto("");
      setBaloes((b) => [...b, { de: "cliente", texto: msg }, { de: "robo", texto: mensagemComando(comando, cfgCmd) },
        { de: "sistema", texto: comando === "atendente" ? "Comando global: transferiria para um atendente" : "Comando global: encerraria o atendimento" }]);
      setEstado((e) => ({ no_atual: null, status: comando === "atendente" ? "transbordo" : "finalizado", variaveis: e?.variaveis ?? {} }));
      return;
    }
    const reinicio = comando === "inicio";
    if (!reinicio && estado && (estado.status === "finalizado" || estado.status === "transbordo")) {
      setBaloes((b) => [...b, { de: "sistema", texto: "O fluxo já terminou. Clique em Reiniciar ou envie #inicio." }]);
      return;
    }
    setRodando(true);
    setTexto("");
    const novos: Balao[] = [{ de: "cliente", texto: msg }];
    if (reinicio) novos.push({ de: "sistema", texto: "Comando global: voltando ao início do fluxo" });
    const base = { protocolo: "2026-000123", nome: "Cliente Teste", telefone: "5511999999999" };
    const ini: EstadoExec = reinicio
      ? { no_atual: null, status: "ativo", variaveis: { ...base, ...(estado?.variaveis ?? {}) } }
      : estado ?? { no_atual: null, status: "ativo", variaveis: base };
    const ent: Record<string, Record<string, string>> = { ...entradas };
    let erro: { id: string; msg: string } | null = null;
    const marcar = (ids: string[] | undefined, v: Record<string, string>) => { for (const id of ids ?? []) ent[id] = { ...v, ultima_mensagem: msg }; };
    let res = executarFluxo({ nos, conexoes, estado: ini, texto: msg });
    marcar(res.trilha, ini.variaveis);
    const visitados = [...trilha.map((t) => t.id), ...(res.trilha ?? [])];
    aplicar(res.acoes, novos);
    for (let passos = 0; res.externo && passos < 20; passos++) {
      const no = res.externo.no;
      const tipo = (no.data.tipo ?? no.type) as TipoNo;
      let saida: string; let vars = res.estado.variaveis;
      ent[no.id] = { ...vars };
      if (tipo === "http") {
        const r = await executarHttp(no.data, vars); saida = r.saida; vars = r.variaveis;
        if (r.saida === "falha") erro = { id: no.id, msg: r.erro ?? `HTTP ${vars[`${String(no.data["variavel"] || "resposta")}_status`] ?? ""}` };
        if (r.erro) novos.push({ de: "sistema", texto: `API falhou: ${r.erro} (no teste, o navegador pode bloquear APIs que funcionam no servidor)` });
      } else if (tipo === "codigo") {
        const r = executarCodigo(no.data, vars); saida = r.saida; vars = r.variaveis;
        if (r.erro) erro = { id: no.id, msg: `JavaScript: ${r.erro}` };
        if (r.erro) novos.push({ de: "sistema", texto: `Erro no JavaScript: ${r.erro}` });
      } else {
        novos.push({ de: "robo", texto: "(Resposta da IA — no teste não é gerada)" });
        saida = "respondeu";
      }
      const prox = proximoNoId(conexoes, no.id, saida);
      if (!prox) {
        const continua = tipo === "ia";
        if (!continua && saida !== "sucesso") { erro ??= { id: no.id, msg: `Saída "${saida}" sem ligação` }; novos.push({ de: "sistema", texto: `Fluxo parou em "${nomeNo(no.id)}": saída "${saida}" não está ligada` }); }
        res = { acoes: [], estado: { no_atual: continua ? no.id : null, status: continua ? "aguardando" : "finalizado", variaveis: vars } };
        break;
      }
      res = executarFluxo({ nos, conexoes, estado: { no_atual: prox, status: "ativo", variaveis: vars }, texto: msg });
      marcar(res.trilha, vars);
      visitados.push(...(res.trilha ?? []));
      aplicar(res.acoes, novos);
    }
    if (res.subfluxo) novos.push({ de: "sistema", texto: "Continuaria em outro fluxo (teste esse fluxo separadamente)" });
    if (res.estado.status === "finalizado" && !res.subfluxo) novos.push({ de: "sistema", texto: "Fim do fluxo" });
    setBaloes((b) => [...b, ...novos]);
    setEstado(res.estado);
    setTrilha(visitados.map((id) => ({ id, titulo: nomeNo(id) })));
    setEntradas(ent);
    setErroNo(erro);
    onTrilha(visitados, res.estado.status === "aguardando" ? res.estado.no_atual : null, { erro, entradas: ent });
    setRodando(false);
  };

  const vars = Object.entries(estado?.variaveis ?? {});
  const statusTxt: Record<EstadoExec["status"], string> = { ativo: "Em execução", aguardando: "Aguardando resposta", finalizado: "Finalizado", transbordo: "Com atendente" };

  if (!open) return null;
  return (
    <section aria-label="Testar fluxo" className="flex h-80 shrink-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b px-3 py-1.5 text-sm">
        <span className="font-medium">Testar fluxo</span>
        <span className="truncate text-xs text-muted-foreground">
          · {estado ? statusTxt[estado.status] : "Converse como o cliente — nada é enviado de verdade"}
          {estado?.status === "aguardando" && estado.no_atual ? ` em "${nomeNo(estado.no_atual)}"` : ""}
        </span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={reiniciar}><RotateCcw className="size-3.5" /> Reiniciar</Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Fechar teste" onClick={() => onOpenChange(false)}><X className="size-4" /></Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(280px,2fr)_3fr]">
        <div className="flex min-h-0 flex-col gap-2 border-r p-2">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md bg-muted/30 p-2">
            {baloes.length === 0 && <p className="text-center text-xs text-muted-foreground">Digite uma mensagem abaixo para iniciar.</p>}
            {baloes.map((b, i) => b.de === "sistema" ? (
              <p key={i} className="text-center text-[11px] text-muted-foreground">— {b.texto} —</p>
            ) : (
              <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm", b.de === "cliente" ? "ml-auto bg-primary text-primary-foreground" : "bg-card")}>
                {b.midiaUrl && b.midiaTipo === "imagem" && <img src={b.midiaUrl} alt="" className="mb-1 max-h-48 rounded" />}
                {b.midiaUrl && b.midiaTipo === "video" && <video src={b.midiaUrl} controls className="mb-1 max-h-48 rounded" />}
                {b.midiaUrl && b.midiaTipo === "documento" && <a href={b.midiaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 underline"><FileText className="size-4" /> Arquivo</a>}
                <TextoWhatsapp text={b.texto} />
              </div>
            ))}
            <div ref={fimRef} />
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite como o cliente…" disabled={rodando} autoFocus />
            <Button type="submit" size="icon" disabled={rodando || !texto.trim()} aria-label="Enviar"><Send className="size-4" /></Button>
          </form>
        </div>
        <Tabs defaultValue="etapas" className="flex min-h-0 flex-col p-2">
          <TabsList className="w-fit">
            <TabsTrigger value="etapas">Etapas ({trilha.length})</TabsTrigger>
            <TabsTrigger value="dados">Dados ({vars.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="etapas" className="min-h-0 flex-1 overflow-y-auto">
            {trilha.length === 0 ? <p className="text-sm text-muted-foreground">Os blocos percorridos aparecem aqui. Clique em um para ver o que chegou nele.</p> : (
              <ol className="space-y-1 text-sm">
                {trilha.map((t, i) => {
                  const falhou = erroNo?.id === t.id && i === trilha.length - 1 - [...trilha].reverse().findIndex((x) => x.id === t.id);
                  return (
                    <li key={i}>
                      <button type="button" onClick={() => onSelecionar?.(t.id)} className={cn("w-full rounded border px-2 py-1 text-left hover:bg-accent", falhou && "border-destructive bg-destructive/10 text-destructive")}>
                        <span className="text-muted-foreground">{i + 1}.</span> {t.titulo}
                        {falhou && <span className="block text-xs">⚠ {erroNo!.msg}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </TabsContent>
          <TabsContent value="dados" className="min-h-0 flex-1 overflow-y-auto">
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
        </Tabs>
      </div>
    </section>
  );
}
