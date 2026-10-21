import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, MessageCircle, Send, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { dispararMensagem, sanitizarTelefone } from "@/lib/atendimentos-envio";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orcamento: Row;
  empresa: Row | null | undefined;
  cliente: Row | undefined;
  link: string;
  /** Salva a proposta antes do envio; retorna false se falhar. */
  antesDeEnviar: () => Promise<boolean>;
  titulo?: string;
  mensagemInicial?: string;
};

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Envio da proposta digital por WhatsApp (instância ou wa.me) ou e-mail, escolhendo entre os contatos do cliente. */
export function EnviarPropostaDialog({ open, onOpenChange, orcamento, empresa, cliente, link, antesDeEnviar, titulo, mensagemInicial }: Props) {
  const empresaId = text(orcamento["empresa_id"] ?? rowId(empresa ?? {}));
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [instId, setInstId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [canal, setCanal] = useState<"whatsapp" | "email">("whatsapp");
  const [email, setEmail] = useState("");
  const [assunto, setAssunto] = useState("");
  const [msgEmail, setMsgEmail] = useState("");
  const [contatoNome, setContatoNome] = useState("");
  const clienteId = text(rowId(cliente ?? {}));

  const { data: contatos = [] } = useQuery({
    queryKey: ["proposta-contatos", clienteId],
    enabled: open && !!clienteId,
    queryFn: async () => {
      const { data } = await supabase.from("cadastro_contatos" as never).select("*")
        .eq("entidade", "parceiro").eq("entidade_id", clienteId);
      const lista = ((data ?? []) as Row[]).filter((c) => c["ativo"] !== false && text(c["valor"]));
      return lista.sort((a, b) => Number(!!b["principal"]) - Number(!!a["principal"]) || text(a["nome"]).localeCompare(text(b["nome"]), "pt-BR"));
    },
  });

  const escolher = (c: Row) => {
    setContatoNome(text(c["nome"]));
    if (text(c["tipo"]) === "email") { setEmail(text(c["valor"])); setCanal("email"); }
    else { setTelefone(text(c["valor"])); setCanal("whatsapp"); }
  };

  useEffect(() => {
    if (!open) return;
    const nome = text(pick(cliente ?? {}, ["nome_fantasia", "razao_social", "nome"]));
    const emp = text(pick(empresa ?? {}, ["nome_fantasia", "razao_social", "nome"]));
    setTelefone(text(pick(cliente ?? {}, ["whatsapp", "celular", "telefone"])));
    setEmail(text(pick(cliente ?? {}, ["email"])));
    setContatoNome("");
    setAssunto(`${emp ? `${emp} — ` : ""}Oferta ${text(orcamento["numero"])}${nome ? ` para ${nome}` : ""}`);
    setMsgEmail(`Segue a sua Oferta ${text(orcamento["numero"])} no valor de ${valorProposta(orcamento)}. Clique no botão abaixo para conferir todos os detalhes, o contrato e assinar eletronicamente.`);
    if (mensagemInicial) return setMensagem(mensagemInicial);
    setMensagem(
      [
        `Olá${nome ? `, ${nome}` : ""}!`,
        "",
        `Segue a sua Oferta *${text(orcamento["numero"])}*${emp ? ` da *${emp}*` : ""} no valor de *${valorProposta(orcamento)}*.`,
        "",
        "Você pode conferir todos os detalhes, o contrato e assinar eletronicamente pelo link:",
        `🔗 ${link}`,
        "",
        "Qualquer dúvida, é só responder esta mensagem.",
      ].join("\n"),
    );
  }, [open, orcamento, cliente, empresa, link, mensagemInicial]);

  const { data: instancias = [] } = useQuery({
    queryKey: ["proposta-instancias", empresaId],
    enabled: open && !!empresaId,
    queryFn: async () => {
      const { data } = await supabase.from("empresas_instancias").select("*").eq("empresa_id", empresaId as never);
      return ((data ?? []) as Row[]).filter((i) => i["status"] !== false && i["ativo"] !== false && text(i["tipo"]) !== "chat");
    },
  });

  useEffect(() => {
    if (!instId && instancias.length) setInstId(text(rowId(instancias[0]!)));
  }, [instancias, instId]);

  const validar = () => {
    if (!sanitizarTelefone(telefone)) {
      toast.error("Informe o WhatsApp do cliente.");
      return false;
    }
    return true;
  };

  const enviarInstancia = async () => {
    if (!validar() || !(await antesDeEnviar())) return;
    setEnviando(true);
    try {
      const inst = instancias.find((i) => text(rowId(i)) === instId);
      await dispararMensagem({ instancia: inst, mensagemId: null, atendimentoId: null, telefone, texto: mensagem });
      const { error: acompanhamentoErro } = await supabase.rpc("oferta_marcar_envio", { p_id: String(rowId(orcamento) ?? "") });
      if (acompanhamentoErro) toast.warning("Mensagem enviada, mas o acompanhamento não foi iniciado. Confira a instalação da régua.");
      await registrar(`Oferta enviada por WhatsApp para ${contatoNome ? `${contatoNome} (${telefone})` : telefone}`, "whatsapp");
      toast.success("Mensagem enviada pelo WhatsApp da empresa.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setEnviando(false);
    }
  };

  const registrar = async (descricao: string, tipo: string) => {
    await supabase.from("orcamento_interacoes" as never).insert({
      orcamento_id: String(rowId(orcamento) ?? ""), tipo, descricao, empresa_id: empresaId || null,
    } as never);
  };

  const enviarEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Informe um e-mail válido.");
    if (!(await antesDeEnviar())) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("cobranca-regua", {
        body: { acao: "proposta_email", orcamento_id: String(rowId(orcamento) ?? ""), para: email.trim(), assunto, mensagem: msgEmail, link, contato_nome: contatoNome },
      });
      if (error) {
        let msg = error.message;
        try { const ctx = (error as { context?: Response }).context; if (ctx) msg = ((await ctx.json()) as { erro?: string }).erro ?? msg; } catch { /* */ }
        if (/Failed to send|404/i.test(msg)) msg = 'Motor de e-mail não atualizado. Publique a função "cobranca-regua" (versão 4).';
        throw new Error(msg);
      }
      if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro);
      const { error: acompanhamentoErro } = await supabase.rpc("oferta_marcar_envio", { p_id: String(rowId(orcamento) ?? "") });
      if (acompanhamentoErro) toast.warning("E-mail enviado, mas o acompanhamento não foi iniciado.");
      await registrar(`Oferta enviada por e-mail para ${contatoNome ? `${contatoNome} <${email.trim()}>` : email.trim()}`, "email");
      toast.success(`Oferta enviada para ${email.trim()}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o e-mail.");
    } finally {
      setEnviando(false);
    }
  };

  const abrirWhats = async () => {
    if (!validar() || !(await antesDeEnviar())) return;
    window.open(`https://wa.me/${sanitizarTelefone(telefone)}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo ?? "Enviar Oferta"}</DialogTitle>
          <DialogDescription>O cliente recebe o link para conferir e assinar a Oferta e o contrato.</DialogDescription>
        </DialogHeader>
        {contatos.length > 0 && (
          <div className="space-y-1">
            <Label>Contatos do cliente</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1">
              {contatos.map((c) => {
                const ehEmail = text(c["tipo"]) === "email";
                const ativo = ehEmail ? email === text(c["valor"]) && canal === "email" : telefone === text(c["valor"]) && canal === "whatsapp";
                return (
                  <button key={text(rowId(c))} type="button" onClick={() => escolher(c)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${ativo ? "bg-primary/10" : ""}`}>
                    {ehEmail ? <Mail className="h-4 w-4 shrink-0 text-primary" /> : <MessageCircle className="h-4 w-4 shrink-0 text-primary" />}
                    <span className="flex-1 truncate">
                      <span className="font-medium">{text(c["nome"]) || "Sem nome"}</span>
                      {text(c["finalidade"]) && <span className="text-muted-foreground"> · {text(c["finalidade"])}</span>}
                      <span className="block truncate text-xs text-muted-foreground">{text(c["valor"])}</span>
                    </span>
                    {!!c["principal"] && <span className="text-xs text-muted-foreground">Principal</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {contatos.length === 0 && clienteId && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3.5 w-3.5" /> Este cliente não tem contatos cadastrados. Digite abaixo ou cadastre em Contatos.</p>
        )}
        <div className="flex gap-1 rounded-md bg-muted p-1">
          {(["whatsapp", "email"] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCanal(c)}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-3 py-1.5 text-sm ${canal === c ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
              {c === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} {c === "email" ? "E-mail" : "WhatsApp"}
            </button>
          ))}
        </div>
        {canal === "whatsapp" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>WhatsApp do cliente</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          {instancias.length > 0 && (
            <div className="space-y-1">
              <Label>Enviar pelo número</Label>
              <Select value={instId} onValueChange={setInstId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {instancias.map((i) => (
                    <SelectItem key={text(rowId(i))} value={text(rowId(i))}>
                      {text(pick(i, ["nome", "telefone", "instance_id"]))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Mensagem</Label>
            <Textarea rows={9} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </div>
        </div>
        ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>E-mail do destinatário</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@cliente.com.br" />
          </div>
          <div className="space-y-1">
            <Label>Assunto</Label>
            <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Mensagem</Label>
            <Textarea rows={6} value={msgEmail} onChange={(e) => setMsgEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">O e-mail sai no padrão visual do sistema, com o logo da empresa, valor, validade e o botão para conferir e assinar.</p>
          </div>
        </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          {canal === "whatsapp" ? (
            <>
              <Button variant="outline" onClick={abrirWhats}>
                <MessageCircle className="mr-1 h-4 w-4" /> Abrir no meu WhatsApp
              </Button>
              {instancias.length > 0 && (
                <Button onClick={enviarInstancia} disabled={enviando}>
                  <Send className="mr-1 h-4 w-4" /> {enviando ? "Enviando…" : "Enviar pela empresa"}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={enviarEmail} disabled={enviando}>
              <Mail className="mr-1 h-4 w-4" /> {enviando ? "Enviando…" : "Enviar por e-mail"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function valorProposta(o: Record<string, unknown>): string {
  const imp = Number(o["total_liquido"]) || 0;
  const rec = Number(o["total_recorrente"]) || 0;
  const f = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (rec > 0 && imp === 0) return `${f(rec)}/mês`;
  if (rec > 0) return `${f(imp)} + ${f(rec)}/mês`;
  return f(imp);
}
