import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { filterPayload, useCols } from "@/lib/projetos";
import { useAudit } from "@/lib/audit";
import { nomePessoa, telefonePessoa } from "@/lib/atendimentos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { PhoneInput } from "@/components/data-table/PhoneInput";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instancias: Row[];
  kanbans: Row[];
  etapas: Row[];
  pessoas: Row[];
  onCriado: (id: string) => void;
};

const digitos = (v: unknown) => text(v).replace(/\D/g, "");

/** Envio best-effort para a Z-API/n8n com a url e token da instância. */
async function dispararZapi(inst: Row | undefined, telefone: string, mensagem: string) {
  const url = text(pick(inst, ["url", "url_api", "webhook_url", "endpoint"]));
  if (!url) return;
  const token = text(pick(inst, ["token"]));
  const clientToken = text(pick(inst, ["client_token"]));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;
  if (token) headers["token"] = token;
  const destino = /send-text|webhook/i.test(url) ? url : `${url.replace(/\/$/, "")}/send-text`;
  await fetch(destino, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: digitos(telefone), message: mensagem, instancia_id: rowId(inst ?? {}) }),
  });
}

export function NovoAtendimentoDialog({ open, onOpenChange, instancias, kanbans, etapas, pessoas, onCriado }: Props) {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const { data: colsAt } = useCols("atendimentos");
  const { data: colsMsg } = useCols("atendimentos_mensagem");
  const { data: colsPes } = useCols("pessoas");

  const [inst, setInst] = useState("");
  const [kanban, setKanban] = useState("");
  const [pessoaId, setPessoaId] = useState("");
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [fone, setFone] = useState("");
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);

  const opcoes = useMemo(
    () =>
      pessoas.map((p) => ({
        value: text(rowId(p)),
        label: nomePessoa(p),
        hint: telefonePessoa(p),
        keywords: [telefonePessoa(p), digitos(telefonePessoa(p)), text(pick(p, ["cpf", "cpf_cnpj", "documento", "cnpj"]))],
      })),
    [pessoas],
  );

  function reset() {
    setInst(""); setKanban(""); setPessoaId(""); setNovo(false); setNome(""); setFone(""); setMsg("");
  }

  async function confirmar() {
    if (!inst || !kanban) { toast.error("Escolha a instância e o departamento."); return; }
    if (!novo && !pessoaId) { toast.error("Selecione ou cadastre o contato."); return; }
    if (novo && (!nome.trim() || digitos(fone).length < 10)) { toast.error("Informe nome e telefone com DDD."); return; }
    if (!msg.trim()) { toast.error("Digite a primeira mensagem."); return; }
    setSalvando(true);
    try {
      // 1. Pessoa
      let pid = pessoaId;
      let telefone = telefonePessoa(pessoas.find((p) => text(rowId(p)) === pessoaId));
      if (novo) {
        const existente = pessoas.find((p) => digitos(telefonePessoa(p)).endsWith(digitos(fone).slice(-10)));
        if (existente) {
          pid = text(rowId(existente));
          telefone = telefonePessoa(existente);
        } else {
          const { data, error } = await supabase
            .from("pessoas")
            .insert(filterPayload({ nome: nome.trim(), telefone: fone, empresa_id: empresaId, status: true }, colsPes))
            .select()
            .single();
          if (error) throw error;
          pid = text(rowId(data as Row));
          telefone = fone;
        }
      }
      // 2. Atendimento
      const primeira = etapas
        .filter((e) => text(pick(e, ["kanban_nome_id", "kanban_id"])) === kanban)
        .sort((a, b) => Number(pick(a, ["ordem", "posicao"]) ?? 0) - Number(pick(b, ["ordem", "posicao"]) ?? 0))[0];
      const at: Row = {
        pessoas_id: pid,
        pessoa_id: pid,
        instancia_id: inst,
        kanban_nome_id: kanban,
        kanban_etapa_id: primeira ? rowId(primeira) : null,
        status: "Em atendimento",
        status_atendimento: "Em atendimento",
        modo_atendimento: "Humano",
        usuario_responsavel_id: usuarioId,
        empresa_id: empresaId,
      };
      const { data: novoAt, error: eAt } = await supabase.from("atendimentos").insert(filterPayload(at, colsAt)).select().single();
      if (eAt) throw eAt;
      const aid = text(rowId(novoAt as Row));
      // 3. Primeira mensagem
      const { error: eMsg } = await supabase.from("atendimentos_mensagem").insert(
        filterPayload(
          {
            atendimento_id: aid,
            mensagem: msg,
            remetente_tipo: "atendente",
            tipo: "texto",
            msg_interna: false,
            from_me: true,
            direcao: "saida",
            usuario_id: usuarioId,
            instancia_id: inst,
            empresa_id: empresaId,
          },
          colsMsg,
        ),
      );
      if (eMsg) throw eMsg;
      // 4. Disparo
      try {
        await dispararZapi(instancias.find((i) => text(rowId(i)) === inst), telefone, msg);
      } catch (e) {
        console.error(e);
        toast.warning("Atendimento criado, mas o envio pela instância falhou.");
      }
      qc.invalidateQueries({ queryKey: ["table"] });
      toast.success("Atendimento iniciado.");
      reset();
      onOpenChange(false);
      onCriado(aid);
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message ?? "Erro ao iniciar atendimento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Iniciar atendimento</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Instância (canal)</Label>
            <Select value={inst} onValueChange={setInst}>
              <SelectTrigger><SelectValue placeholder="Selecione a instância" /></SelectTrigger>
              <SelectContent>
                {instancias.map((i) => (
                  <SelectItem key={text(rowId(i))} value={text(rowId(i))}>
                    {text(pick(i, ["nome", "descricao"]))}
                    {pick(i, ["telefone", "numero"]) ? ` · ${text(pick(i, ["telefone", "numero"]))}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Departamento</Label>
            <Select value={kanban} onValueChange={setKanban}>
              <SelectTrigger><SelectValue placeholder="Selecione o departamento" /></SelectTrigger>
              <SelectContent>
                {kanbans.map((k) => (
                  <SelectItem key={text(rowId(k))} value={text(rowId(k))}>{text(pick(k, ["nome", "descricao"]))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Contato</Label>
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => { setNovo((v) => !v); setPessoaId(""); }}>
                {novo ? "Buscar existente" : "+ Cadastrar novo"}
              </Button>
            </div>
            {novo ? (
              <div className="space-y-2">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" />
                <PhoneInput value={fone} onChange={setFone} />
              </div>
            ) : (
              <SearchSelect
                value={pessoaId}
                onChange={setPessoaId}
                options={opcoes}
                placeholder="Buscar por nome, telefone ou CPF"
                searchPlaceholder="Nome, telefone ou CPF…"
                emptyText="Não encontrado. Use “+ Cadastrar novo”."
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Primeira mensagem</Label>
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Olá! Tudo bem?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando}>{salvando ? "Enviando…" : "Iniciar e enviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
