import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Pencil, PlugZap, Plus, Star, Trash2 } from "lucide-react";
import { BancoApiSheet } from "./BancoApiSheet";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { formatBRL, num } from "@/lib/orcamentos";
import { mascaraMoeda, moedaDeNumero } from "@/lib/input-masks";
import { BANCOS, nomeBanco } from "@/lib/pix";
import type { Row } from "@/lib/row";
import { confirmar } from "@/components/layout/DialogoGlobal";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const TABELA = "financeiro_contas_bancarias";

export function ContasBancarias({ perms }: { perms: Perms }) {
  const qc = useQueryClient();
  const { data: contas = [], isLoading } = useTableRows(TABELA);
  const [editar, setEditar] = useState<Row | null | undefined>(undefined);
  const [api, setApi] = useState<Row | null>(null);
  const invalidar = () => qc.invalidateQueries({ queryKey: ["table", TABELA] });

  const excluir = async (c: Row) => {
    if (!await confirmar(`Excluir a conta "${text(c["descricao"])}"?`)) return;
    const { error } = await supabase.from(TABELA as never).delete().eq("id", text(rowId(c)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Conta excluída."); invalidar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Contas bancárias</h2>
          <p className="text-muted-foreground text-sm">Contas que recebem Pix e boletos. A conta padrão é sugerida nas cobranças.</p>
        </div>
        {perms.canCreate && <Button onClick={() => setEditar(null)}><Plus className="mr-1 h-4 w-4" />Nova conta</Button>}
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Carregando…</p> : !contas.length ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">Nenhuma conta cadastrada ainda.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contas.map((c) => (
            <div key={text(rowId(c))} className="bg-card space-y-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Landmark className="text-primary h-5 w-5" />
                  <div>
                    <p className="font-semibold">{text(c["descricao"])}</p>
                    <p className="text-muted-foreground text-xs">{text(c["banco"])} — {nomeBanco(c["banco"])}</p>
                  </div>
                </div>
                {c["padrao"] ? <span className="bg-primary/10 text-primary flex items-center gap-1 rounded px-2 py-0.5 text-xs"><Star className="h-3 w-3" />Padrão</span> : null}
              </div>
              <p className="text-sm">Ag. {text(c["agencia"]) || "—"} • Conta {text(c["conta"]) || "—"}{c["digito"] ? `-${text(c["digito"])}` : ""}</p>
              <p className="truncate text-sm">Pix: <span className="font-medium">{text(c["chave_pix"]) || "não informado"}</span></p>
              <p className="text-muted-foreground text-xs">Multa {num(c["multa_percentual"])}% • Juros {num(c["juros_mensal_percentual"])}% a.m.{num(c["tarifa_boleto_baixa"]) || num(c["tarifa_pix"]) ? ` • Boleto ${formatBRL(c["tarifa_boleto_baixa"])} (${num(c["franquia_boleto"])} grátis) • Pix ${formatBRL(c["tarifa_pix"])}` : ""}{c["ativo"] === false ? " • Inativa" : ""}</p>
              <div className="flex justify-end gap-1">
                {c["provedor_api"] ? <span className={`mr-auto self-center rounded px-2 py-0.5 text-xs ${c["api_ativo"] ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>API {text(c["provedor_api"])} {c["api_ativo"] ? "ativa" : "inativa"}</span> : null}
                {perms.canUpdate && <Button variant="ghost" size="icon" aria-label="Integração bancária" title="Integração bancária (API)" onClick={() => setApi(c)}><PlugZap className="h-4 w-4" /></Button>}
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditar(c)}><Pencil className="h-4 w-4" /></Button>
                {perms.canDelete && <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir(c)}><Trash2 className="text-destructive h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {api && <BancoApiSheet conta={api} onClose={() => setApi(null)} onSaved={invalidar} />}
      {editar !== undefined && <ContaSheet registro={editar} readOnly={!!editar && !perms.canUpdate} onClose={() => setEditar(undefined)} onSaved={invalidar} />}
    </div>
  );
}

const TARIFAS = ["tarifa_boleto_emissao", "tarifa_boleto_baixa", "tarifa_pix"] as const;
const FRANQUIAS = ["franquia_boleto", "franquia_pix"] as const;
const CAMPOS = ["descricao", "banco", "agencia", "conta", "digito", "convenio", "carteira", "titular_nome", "titular_documento", "cidade", "chave_pix", "instrucoes"] as const;

function ContaSheet({ registro, readOnly, onClose, onSaved }: { registro: Row | null; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const { isMaster, empresa } = useAuth();
  const { empresaId } = useAudit();
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const k of CAMPOS) o[k] = text(registro?.[k]);
    if (!o["banco"]) o["banco"] = "077";
    o["multa"] = registro ? String(num(registro["multa_percentual"])) : "2";
    o["juros"] = registro ? String(num(registro["juros_mensal_percentual"])) : "1";
    for (const k of TARIFAS) o[k] = registro ? moedaDeNumero(num(registro[k])) : "";
    for (const k of FRANQUIAS) o[k] = registro ? String(num(registro[k]) || "") : "";
    return o;
  });
  const [padrao, setPadrao] = useState(!!registro?.["padrao"]);
  const [gerarDespesa, setGerarDespesa] = useState(registro ? registro["gerar_despesa_tarifa"] !== false : true);
  const [ativo, setAtivo] = useState(registro ? registro["ativo"] !== false : true);
  const [salvando, setSalvando] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const dec = (s: string) => num(String(s).replace(",", "."));

  const salvar = async () => {
    if (!v["descricao"]?.trim()) return void toast.error("Informe um nome para a conta.");
    setSalvando(true);
    const emp = registro ? text(registro["empresa_id"]) : isMaster && empresa ? text(rowId(empresa)) : text(empresaId);
    const dados: Record<string, unknown> = { padrao, ativo, multa_percentual: dec(v["multa"] ?? ""), juros_mensal_percentual: dec(v["juros"] ?? "") };
    for (const k of CAMPOS) dados[k] = v[k]?.trim() || null;
    for (const k of TARIFAS) dados[k] = num(v[k] ?? "");
    for (const k of FRANQUIAS) dados[k] = Math.max(0, Math.floor(num(v[k] ?? "")));
    dados["gerar_despesa_tarifa"] = gerarDespesa;
    if (padrao) await supabase.from(TABELA as never).update({ padrao: false } as never).eq("empresa_id", emp);
    const q = registro
      ? supabase.from(TABELA as never).update(dados as never).eq("id", text(rowId(registro)))
      : supabase.from(TABELA as never).insert({ ...dados, empresa_id: emp } as never);
    const { error } = await q;
    setSalvando(false);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Conta salva."); onSaved(); onClose();
  };

  const moeda = (k: string, label: string) => (
    <div className="space-y-1"><Label>{label}</Label><Input inputMode="numeric" value={v[k] ?? ""} onChange={(e) => setV((s) => ({ ...s, [k]: mascaraMoeda(e.target.value) }))} placeholder="0,00" disabled={readOnly} /></div>
  );
  const campo = (k: string, label: string, ph = "") => (
    <div className="space-y-1"><Label>{label}</Label><Input value={v[k] ?? ""} onChange={set(k)} placeholder={ph} disabled={readOnly} /></div>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{registro ? "Editar conta bancária" : "Nova conta bancária"}</SheetTitle>
          <SheetDescription>Dados usados no Pix e nas instruções do boleto.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("descricao", "Nome da conta *", "Ex.: Inter PJ principal")}
            <div className="space-y-1">
              <Label>Banco</Label>
              <Select value={v["banco"] ?? "077"} onValueChange={(b) => setV((s) => ({ ...s, banco: b }))} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BANCOS.map((b) => <SelectItem key={b.codigo} value={b.codigo}>{b.codigo} — {b.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {campo("agencia", "Agência")}
            <div className="grid grid-cols-[1fr_80px] gap-2">{campo("conta", "Conta")}{campo("digito", "Dígito")}</div>
            {campo("convenio", "Convênio / código beneficiário")}
            {campo("carteira", "Carteira")}
            {campo("titular_nome", "Titular (nome no Pix)")}
            {campo("titular_documento", "CNPJ/CPF do titular")}
            {campo("cidade", "Cidade (Pix)")}
            {campo("chave_pix", "Chave Pix", "CNPJ, e-mail, +55 telefone ou aleatória")}
            {campo("multa", "Multa por atraso (%)")}
            {campo("juros", "Juros ao mês (%)")}
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="font-medium">Tarifas e pacote da conta</p>
              <p className="text-muted-foreground text-xs">As primeiras liquidações do mês dentro da franquia são isentas; a partir da seguinte, cobra a tarifa.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {moeda("tarifa_boleto_emissao", "Boleto — emissão (R$)")}
              {moeda("tarifa_boleto_baixa", "Boleto — baixa (R$)")}
              <div className="space-y-1"><Label>Boletos grátis/mês</Label><Input inputMode="numeric" value={v["franquia_boleto"] ?? ""} onChange={(e) => setV((s) => ({ ...s, franquia_boleto: e.target.value.replace(/\D/g, "") }))} placeholder="Ex.: 100" disabled={readOnly} /></div>
              {moeda("tarifa_pix", "Pix recebido (R$)")}
              <div className="space-y-1"><Label>Pix grátis/mês</Label><Input inputMode="numeric" value={v["franquia_pix"] ?? ""} onChange={(e) => setV((s) => ({ ...s, franquia_pix: e.target.value.replace(/\D/g, "") }))} placeholder="0" disabled={readOnly} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={gerarDespesa} onCheckedChange={setGerarDespesa} disabled={readOnly} />Lançar a tarifa automaticamente em Contas a Pagar (categoria Tarifas Bancárias)</label>
          </div>
          <div className="space-y-1"><Label>Instruções do boleto</Label><Textarea value={v["instrucoes"] ?? ""} onChange={set("instrucoes")} disabled={readOnly} placeholder="Ex.: Não receber após 30 dias do vencimento." /></div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={padrao} onCheckedChange={setPadrao} disabled={readOnly} />Conta padrão</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={ativo} onCheckedChange={setAtivo} disabled={readOnly} />Ativa</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar} disabled={salvando}>Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
