import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Send } from "lucide-react";
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

/** Envio da proposta digital (Oferta + contrato) por WhatsApp: instância da empresa ou wa.me. */
export function EnviarPropostaDialog({ open, onOpenChange, orcamento, empresa, cliente, link, antesDeEnviar, titulo, mensagemInicial }: Props) {
  const empresaId = text(orcamento["empresa_id"] ?? rowId(empresa ?? {}));
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [instId, setInstId] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nome = text(pick(cliente ?? {}, ["nome_fantasia", "razao_social", "nome"]));
    const emp = text(pick(empresa ?? {}, ["nome_fantasia", "razao_social", "nome"]));
    setTelefone(text(pick(cliente ?? {}, ["whatsapp", "celular", "telefone"])));
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
      toast.success("Mensagem enviada pelo WhatsApp da empresa.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar.");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo ?? "Enviar Oferta por WhatsApp"}</DialogTitle>
          <DialogDescription>O cliente recebe o link para conferir e assinar a Oferta e o contrato.</DialogDescription>
        </DialogHeader>
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
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={abrirWhats}>
            <MessageCircle className="mr-1 h-4 w-4" /> Abrir no meu WhatsApp
          </Button>
          {instancias.length > 0 && (
            <Button onClick={enviarInstancia} disabled={enviando}>
              <Send className="mr-1 h-4 w-4" /> {enviando ? "Enviando…" : "Enviar pela empresa"}
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
