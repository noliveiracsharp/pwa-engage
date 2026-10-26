import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, MessageCircle, Play, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTableRows } from "@/lib/crud";
import type { Row } from "@/lib/row";
import { dispararMensagem } from "@/lib/atendimentos-envio";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { PASSOS_PADRAO, horarioComercial, passoDevido, preencherTexto, proximaData, temCanal, type Passo } from "@/lib/sdr-cadencia";

const hojeSP = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

type Props = { fila: Row[]; empresaId: string | null | undefined; podeEditar: boolean; recarregar: () => void };

export function AbordagemSdr({ fila, empresaId, podeEditar, recarregar }: Props) {
  const { data: configs = [] } = useTableRows("sdr_cadencia_config");
  const { data: instancias = [] } = useTableRows("empresas_instancias");
  const { data: empresas = [] } = useTableRows("empresas");
  const cfg = configs.find((c) => String(c["empresa_id"]) === String(empresaId));
  const [passos, setPassos] = useState<Passo[]>(PASSOS_PADRAO);
  const [limite, setLimite] = useState(30);
  const [instId, setInstId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    const p = Array.isArray(cfg["passos"]) && (cfg["passos"] as Passo[]).length ? (cfg["passos"] as Passo[]) : PASSOS_PADRAO;
    setPassos(p); setLimite(Number(cfg["limite_diario"] ?? 30)); setInstId(String(cfg["instancia_id"] ?? ""));
  }, [cfg]);

  const insts = useMemo(() => instancias
    .filter((i) => String(i["empresa_id"]) === String(empresaId) && i["tipo"] !== "chat" && i["status"] !== false)
    .sort((a, b) => String(a["nome"] ?? "").localeCompare(String(b["nome"] ?? ""), "pt-BR")), [instancias, empresaId]);
  const minhaEmpresa = (() => { const e = empresas.find((x) => String(x["id"]) === String(empresaId)); return String(e?.["titulo"] || e?.["nome_fantasia"] || e?.["razao_social"] || ""); })();

  const hoje = hojeSP();
  const pendentes = fila.filter((l) => passoDevido(l, passos, hoje));
  const ativos = fila.filter((l) => l["cadencia_ativa"] === true).length;

  async function salvar() {
    if (!empresaId) return;
    setSalvando(true);
    const { error } = await supabase.from("sdr_cadencia_config" as never).upsert({ empresa_id: empresaId, passos, limite_diario: limite, instancia_id: instId || null, updated_at: new Date().toISOString() } as never, { onConflict: "empresa_id" } as never);
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar. Confirme se o script da abordagem foi executado."); return; }
    toast.success("Sequência salva."); recarregar();
  }

  async function disparar() {
    if (!horarioComercial(new Date()) && !(await confirmar({ title: "Fora do horário comercial", description: "O recomendado é enviar de segunda a sexta, das 8h às 18h. Enviar mesmo assim?" }))) return;
    const inst = insts.find((i) => String(i["id"]) === instId) ?? insts[0];
    const lote = pendentes.slice(0, Math.max(1, limite));
    setRodando(true);
    let ok = 0, falhas = 0, pulados = 0;
    for (const l of lote) {
      const d = passoDevido(l, passos, hoje)!;
      const vars = { empresa: l["nome"], segmento: l["segmento"], cidade: l["cidade"], minha_empresa: minhaEmpresa };
      const texto = preencherTexto(d.passo.texto, vars);
      const prox = proximaData(passos, d.indice, hoje);
      const avancar = { cadencia_passo: d.indice + 1, cadencia_proxima: prox, cadencia_ativa: prox !== null, updated_at: new Date().toISOString() };
      if (!temCanal(l, d.passo.canal)) { pulados++; await supabase.from("sdr_leads" as never).update(avancar as never).eq("id", l["id"] as never); continue; }
      try {
        if (d.passo.canal === "email") {
          const { data, error } = await supabase.functions.invoke("cobranca-regua", { body: { acao: "sdr_email", lead_id: l["id"], assunto: preencherTexto(d.passo.assunto || "{{minha_empresa}}", vars), mensagem: texto } });
          if (error || (data as { erro?: string })?.erro) throw new Error((data as { erro?: string })?.erro || "Motor de e-mail desatualizado (publique a versão 6).");
        } else {
          if (!inst) throw new Error("Nenhum WhatsApp conectado.");
          await dispararMensagem({ instancia: inst, mensagemId: null, atendimentoId: null, telefone: String(l["whatsapp"] || l["telefone"]), texto });
        }
        await supabase.from("sdr_leads" as never).update({ ...avancar, ultimo_contato_em: new Date().toISOString(), ultimo_envio: `Passo ${d.indice + 1} (${d.passo.canal === "email" ? "e-mail" : "WhatsApp"})`, status: l["status"] === "novo" ? "contatado" : l["status"] } as never).eq("id", l["id"] as never);
        ok++;
      } catch (e) {
        falhas++;
        if (falhas === 1) toast.error(e instanceof Error ? e.message : "Falha no envio.");
      }
    }
    setRodando(false); recarregar();
    toast.success(`${ok} enviado(s)${pulados ? ` · ${pulados} sem canal (passo pulado)` : ""}${falhas ? ` · ${falhas} falha(s)` : ""}.`);
  }

  const mudar = (i: number, p: Partial<Passo>) => setPassos((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <div className="font-medium">{pendentes.length} envio(s) previstos para hoje · {ativos} lead(s) em abordagem</div>
          <p className="text-sm text-muted-foreground">Quando o lead responde no WhatsApp, a sequência para e ele vira “Qualificado”.</p>
        </div>
        {podeEditar && (
          <Button onClick={disparar} disabled={rodando || !pendentes.length}>
            {rodando ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Disparar envios de hoje
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>WhatsApp que envia</Label>
          <Select value={instId || String(insts[0]?.["id"] ?? "")} onValueChange={setInstId} disabled={!podeEditar}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{insts.map((i) => <SelectItem key={String(i["id"])} value={String(i["id"])}>{String(i["nome"] ?? i["telefone"] ?? "WhatsApp")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Limite de envios por dia</Label>
          <Input type="number" min={1} max={200} value={limite} onChange={(e) => setLimite(Number(e.target.value) || 1)} disabled={!podeEditar} />
        </div>
      </div>

      <div className="space-y-3">
        {passos.map((p, i) => (
          <div key={i} className="space-y-2 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="font-medium">{p.canal === "email" ? <Mail className="mr-1 inline size-4" /> : <MessageCircle className="mr-1 inline size-4" />}Passo {i + 1}</div>
              <div className="w-28 space-y-1"><Label className="text-xs">Dia</Label><Input type="number" min={0} value={p.dia} onChange={(e) => mudar(i, { dia: Number(e.target.value) || 0 })} disabled={!podeEditar} /></div>
              <div className="w-40 space-y-1"><Label className="text-xs">Canal</Label>
                <Select value={p.canal} onValueChange={(v) => mudar(i, { canal: v as Passo["canal"] })} disabled={!podeEditar}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="email">E-mail</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent>
                </Select>
              </div>
              {podeEditar && passos.length > 1 && <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setPassos((ps) => ps.filter((_, j) => j !== i))} aria-label="Remover passo"><Trash2 className="size-4" /></Button>}
            </div>
            {p.canal === "email" && <Input placeholder="Assunto" value={p.assunto ?? ""} onChange={(e) => mudar(i, { assunto: e.target.value })} disabled={!podeEditar} />}
            <Textarea rows={4} value={p.texto} onChange={(e) => mudar(i, { texto: e.target.value })} disabled={!podeEditar} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Variáveis: {"{{empresa}}"}, {"{{segmento}}"}, {"{{cidade}}"}, {"{{minha_empresa}}"}. Leads sem o canal do passo pulam para o próximo.</p>
      </div>

      {podeEditar && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3">
          <Button variant="outline" onClick={() => setPassos((ps) => [...ps, { dia: (ps.at(-1)?.dia ?? 0) + 2, canal: "whatsapp", texto: "" }])}><Plus className="size-4" /> Adicionar passo</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar sequência</Button>
        </div>
      )}
    </div>
  );
}
