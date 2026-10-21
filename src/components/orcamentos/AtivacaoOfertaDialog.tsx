import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { useTableRows, rowId } from "@/lib/crud";
import type { Row } from "@/lib/row";
import { ESPACOS } from "@/components/projetos/EspacosSidebar";
import { titulosDaOferta } from "@/lib/financeiro";
import { contarTitulosDaOrigem, erroFinanceiro, inserirTitulos, itensDaOferta } from "@/lib/financeiro-db";
import { documentoEstoqueOferta, movimentosEstoqueDaOferta, nomeProjetoDaOferta } from "@/lib/oferta-ativacao";
import { formatBRL } from "@/lib/orcamentos";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  oferta: Row | null;
  cliente: string;
  empresaId: string;
};

export function AtivacaoOfertaDialog({ open, onOpenChange, oferta, cliente, empresaId }: Props) {
  const qc = useQueryClient();
  const { data: espacos = [] } = useTableRows(ESPACOS);
  const [criarProjeto, setCriarProjeto] = useState(true);
  const [gerarFin, setGerarFin] = useState(true);
  const { data: locais = [] } = useTableRows("estoque_locais");
  const [baixarEstoque, setBaixarEstoque] = useState(true);
  const [local, setLocal] = useState("");
  const [nome, setNome] = useState("");
  const [espaco, setEspaco] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && oferta) {
      setNome(nomeProjetoDaOferta(oferta["numero"], cliente));
      setCriarProjeto(true);
      setGerarFin(true);
      setBaixarEstoque(true);
    }
  }, [open, oferta, cliente]);

  const espOpts = espacos
    .filter((e) => !e["empresa_id"] || String(e["empresa_id"]) === empresaId)
    .map((e) => ({ value: String(rowId(e)), label: String(e["nome"] ?? e["descricao"] ?? "Espaço") }));

  const locOpts = locais
    .filter((l) => l["status"] !== false && String(l["empresa_id"] ?? "") === empresaId && l["tipo"] !== "Cliente / Comodato")
    .map((l) => ({ value: String(rowId(l)), label: String(l["descricao"] ?? "Local") }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  useEffect(() => { if (open && !local && locOpts.length) setLocal(locOpts[0]!.value); }, [open, locOpts, local]);

  /** Saída do estoque dos produtos que controlam estoque; comodato vira remessa para o local do cliente. */
  async function baixarEstoqueDaOferta(id: string): Promise<string> {
    const emp = String(oferta!["empresa_id"] ?? empresaId);
    const documento = documentoEstoqueOferta(oferta!["numero"], id);
    const ja = await supabase.from("estoque_movimentacoes").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("documento", documento);
    if (ja.error) throw ja.error;
    if ((ja.count ?? 0) > 0) return "estoque já tinha sido baixado";
    const itens = await itensDaOferta(id);
    const ids = [...new Set(itens.map((i) => String(i["item_id"] ?? "")).filter(Boolean))];
    if (!ids.length) return "";
    const cad = await supabase.from("itens").select("id, controla_estoque").in("id", ids);
    if (cad.error) throw cad.error;
    const controla = new Set((cad.data ?? []).filter((c) => c.controla_estoque !== false).map((c) => String(c.id)));
    const movs = movimentosEstoqueDaOferta(itens, controla);
    if (!movs.length) return "";
    if (!local) throw new Error("Escolha de qual local sai o estoque.");
    const comodato = oferta!["modalidade"] === "comodato";
    let destino: string | null = null;
    if (comodato) {
      const parceiro = String(oferta!["parceiro_id"] ?? "");
      const existente = locais.find((l) => l["tipo"] === "Cliente / Comodato" && String(l["parceiro_id"] ?? "") === parceiro && String(l["empresa_id"] ?? "") === emp);
      if (existente) destino = String(rowId(existente));
      else {
        const novo = await supabase.from("estoque_locais").insert({ empresa_id: emp, descricao: `Comodato — ${cliente || "Cliente"}`, tipo: "Cliente / Comodato", parceiro_id: parceiro || null } as never).select("id").single();
        if (novo.error) throw novo.error;
        destino = String((novo.data as { id: string }).id);
      }
    }
    const { error } = await supabase.from("estoque_movimentacoes").insert(movs.map((m) => ({
      ...m, empresa_id: emp, tipo: comodato ? "remessa_comodato" : "saida_venda",
      local_origem_id: local, local_destino_id: destino, documento,
      observacoes: `Baixa automática na ativação da ${documento}`,
    })) as never);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["table", "estoque_movimentacoes"] });
    return `${movs.length} produto(s) ${comodato ? "enviados em comodato" : "baixados do estoque"}`;
  }

  async function confirmar() {
    if (!oferta) return;
    const id = String(rowId(oferta) ?? "");
    setBusy(true);
    const msgs: string[] = [];
    try {
      if (criarProjeto) {
        if (!espaco) { toast.error("Escolha o espaço do projeto."); setBusy(false); return; }
        const base: Row = {
          nome,
          parceiro_id: oferta["parceiro_id"] ?? null,
          gestor_id: oferta["usuario_id"] ?? oferta["vendedor_id"] ?? null,
          espaco_id: espaco,
          empresa_id: oferta["empresa_id"] ?? empresaId,
          dt_inicio: new Date().toISOString().slice(0, 10),
          orcamento_id: id,
        };
        let { error } = await supabase.from("projetos").insert(base as never);
        if (error && /orcamento_id|dt_inicio|column/i.test(error.message)) {
          const { orcamento_id: _o, dt_inicio: _d, ...resto } = base;
          ({ error } = await supabase.from("projetos").insert(resto as never));
        }
        if (error) throw error;
        msgs.push("projeto criado");
        qc.invalidateQueries({ queryKey: ["table", "projetos"] });
      }
      if (gerarFin) {
        const ja = await contarTitulosDaOrigem([id], ["oferta", "despesa"]);
        if (ja > 0) msgs.push(`financeiro já tinha ${ja} conta(s)`);
        else {
          const n = await inserirTitulos(String(oferta["empresa_id"] ?? empresaId), titulosDaOferta({ ...oferta, id }, await itensDaOferta(id)));
          msgs.push(`${n} conta(s) no Financeiro`);
          qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
        }
      }
      if (baixarEstoque) {
        const r = await baixarEstoqueDaOferta(id);
        if (r) msgs.push(r);
      }
      if (msgs.length) toast.success(`Ativação concluída: ${msgs.join(", ")}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(erroFinanceiro(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /> Oferta ativada</DialogTitle>
          <DialogDescription>Contrato fechado com {cliente || "o cliente"}. O que deseja gerar agora?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="at-proj">Criar projeto de implantação</Label>
            <Switch id="at-proj" checked={criarProjeto} onCheckedChange={setCriarProjeto} />
          </div>
          {criarProjeto && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1"><Label>Nome do projeto</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div className="space-y-1"><Label>Espaço</Label>
                <SearchSelect value={espaco} onChange={setEspaco} options={espOpts} placeholder="Escolha o espaço" />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="at-fin">Gerar contas a receber e a pagar</Label>
            <Switch id="at-fin" checked={gerarFin} onCheckedChange={setGerarFin} />
          </div>
          {gerarFin && oferta && (
            <ul className="text-muted-foreground list-disc space-y-1 rounded-md border p-3 pl-7 text-xs">
              {Number(oferta["total_liquido"]) > 0 && <li>Implantação (produtos + serviços avulsos): {formatBRL(oferta["total_liquido"])}, conforme o parcelamento da Oferta — 1 boleto por parcela.</li>}
              {Number(oferta["total_recorrente"]) > 0 && <li>Mensalidades: {Math.max(1, Math.floor(Number(oferta["vigencia_meses"])) || 12)} × {formatBRL(oferta["total_recorrente"])}, começando no mês seguinte à implantação.</li>}
              <li>Contas a pagar separadas: fornecedor dos produtos e despesas operacionais.</li>
            </ul>
          )}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="at-est">Dar baixa no estoque dos produtos</Label>
            <Switch id="at-est" checked={baixarEstoque} onCheckedChange={setBaixarEstoque} />
          </div>
          {baixarEstoque && (
            <div className="space-y-1 rounded-md border p-3">
              <Label>Sai do local</Label>
              <SearchSelect value={local} onChange={setLocal} options={locOpts} placeholder="Escolha o local de estoque" />
              <p className="text-muted-foreground text-xs">Só produtos com "controla estoque" ligado. {oferta?.["modalidade"] === "comodato" ? "Como é comodato, os equipamentos vão para o local do cliente." : "Registra saída por venda."}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Agora não</Button>
          <Button onClick={confirmar} disabled={busy || (!criarProjeto && !gerarFin && !baixarEstoque)}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
