import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, MessageCircle, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { dispararMensagem, sanitizarTelefone } from "@/lib/atendimentos-envio";

export type Credenciais = {
  motivo: "novo" | "senha" | "email" | "senha_email";
  nome: string;
  email: string;
  senha: string;
  telefone: string;
  empresaId: string;
  empresaNome: string;
};

const TITULOS: Record<Credenciais["motivo"], string> = {
  novo: "Acesso criado",
  senha: "Senha alterada",
  email: "E-mail de acesso alterado",
  senha_email: "Dados de acesso alterados",
};

export function montarMensagem(c: Credenciais, url: string) {
  const acao = c.motivo === "novo" ? "está pronto" : "foi atualizado";
  const linhas = [
    `Olá, ${c.nome || "tudo bem"}!`,
    "",
    `Seu acesso ao sistema${c.empresaNome ? ` da empresa *${c.empresaNome}*` : ""} ${acao}.`,
    "",
    `🔗 Acesso: ${url}`,
    `📧 E-mail: ${c.email}`,
  ];
  if (c.senha) linhas.push(`🔑 Senha: ${c.senha}`);
  linhas.push("", "Por segurança, altere sua senha no primeiro acesso em \"Meus Dados\".", "", "_Mensagem automática do sistema. Não é preciso responder._");
  return linhas.join("\n");
}

export function CredenciaisDialog({ dados, onClose }: { dados: Credenciais | null; onClose: () => void }) {
  const [verSenha, setVerSenha] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [instId, setInstId] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setTelefone(dados?.telefone ?? "");
    setVerSenha(false);
  }, [dados]);

  const { data: instancias = [] } = useQuery({
    queryKey: ["credenciais-instancias", dados?.empresaId],
    enabled: !!dados?.empresaId,
    queryFn: async () => {
      const { data } = await supabase.from("empresas_instancias").select("*").eq("empresa_id", dados!.empresaId as never);
      return ((data ?? []) as Row[]).filter((i) => i["status"] !== false && i["ativo"] !== false);
    },
  });

  useEffect(() => {
    if (!instId && instancias.length) setInstId(text(rowId(instancias[0]!)));
  }, [instancias, instId]);

  const url = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const mensagem = useMemo(() => (dados ? montarMensagem(dados, url) : ""), [dados, url]);

  if (!dados) return null;

  const copiar = async () => {
    await navigator.clipboard.writeText(mensagem);
    toast.success("Dados de acesso copiados.");
  };

  const abrirWhats = () => {
    const phone = sanitizarTelefone(telefone);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener");
  };

  const enviarZapi = async () => {
    const inst = instancias.find((i) => text(rowId(i)) === instId);
    if (!sanitizarTelefone(telefone)) {
      toast.error("Informe o WhatsApp do usuário.");
      return;
    }
    setEnviando(true);
    try {
      await dispararMensagem({ instancia: inst, mensagemId: null, atendimentoId: null, telefone, texto: mensagem });
      toast.success("Dados de acesso enviados pelo WhatsApp.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!dados} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{TITULOS[dados.motivo]}</DialogTitle>
          <DialogDescription>Envie os dados de acesso para {dados.nome || "o usuário"}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="border-border bg-muted/40 space-y-1.5 rounded-md border p-3">
            <p><span className="text-muted-foreground">Acesso:</span> {url}</p>
            <p><span className="text-muted-foreground">E-mail:</span> {dados.email}</p>
            {dados.senha && (
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Senha:</span>
                <span className="font-mono">{verSenha ? dados.senha : "••••••••"}</span>
                <button type="button" onClick={() => setVerSenha((v) => !v)} className="text-muted-foreground hover:text-foreground" aria-label="Mostrar senha">
                  {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>WhatsApp do usuário</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
          </div>

          {instancias.length > 1 && (
            <div className="space-y-1.5">
              <Label>Enviar pela instância</Label>
              <Select value={instId} onValueChange={setInstId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {instancias.map((i) => (
                    <SelectItem key={text(rowId(i))} value={text(rowId(i))}>{text(pick(i, ["nome", "telefone"], "Instância"))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" onClick={copiar}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
          <Button variant="outline" onClick={abrirWhats} disabled={!sanitizarTelefone(telefone)}>
            <MessageCircle className="mr-2 h-4 w-4" />Abrir WhatsApp
          </Button>
          {instancias.length > 0 && (
            <Button onClick={enviarZapi} disabled={enviando || !sanitizarTelefone(telefone)}>
              <Send className="mr-2 h-4 w-4" />{enviando ? "Enviando..." : "Enviar automático"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
