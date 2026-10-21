import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { perguntar } from "@/components/layout/DialogoGlobal";
import { snapshotCotacao, compararCotacoes, type SnapCotacao } from "@/lib/cotacao-versoes";
import { rotuloVersao } from "@/lib/oferta-versoes";
import { formatQtd } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";

type Props = { cotacao: Row; itensCot: Row[]; precos: Row[]; itens: Row[]; canUpdate: boolean; usuarioNome: string };

const SCRIPT = "Rode o script atendeai-cotacao-versoes.sql no SQL Editor.";

export function CotacaoVersoes({ cotacao, itensCot, precos, itens, canUpdate, usuarioNome }: Props) {
  const qc = useQueryClient();
  const cid = String(cotacao["id"]);
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["cotacoes_versoes", cid],
    queryFn: async () => {
      const { data, error } = await supabase.from("cotacoes_versoes" as never).select("*").eq("cotacao_id", cid).order("versao", { ascending: false });
      if (error) return { faltaScript: true, rows: [] as Row[] };
      return { faltaScript: false, rows: (data ?? []) as Row[] };
    },
  });
  const versoes = q.data?.rows ?? [];
  const nomeItem = (id: string) => String(pick(itens.find((i) => String(i["id"]) === id) ?? {}, ["descricao", "nome"]) ?? "Item");
  const atual = useMemo(() => snapshotCotacao(itensCot, precos), [itensCot, precos]);
  const ultima = versoes[0];
  const diff = useMemo(() => (ultima ? compararCotacoes(ultima["snapshot"] as SnapCotacao, atual, nomeItem) : null), [ultima, atual]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    if (q.data?.faltaScript) return void toast.error(SCRIPT);
    if (diff?.igual) return void toast.info("Nada mudou desde a última revisão.");
    const motivo = await perguntar({ title: "Nova revisão da cotação", description: "Descreva o motivo (opcional):", placeholder: "Ex.: fornecedor pediu ajuste de quantidade", confirmText: "Salvar revisão" });
    if (motivo === null) return;
    const versao = Number(ultima?.["versao"] ?? 0) + 1;
    const { error } = await supabase.from("cotacoes_versoes" as never).insert({ cotacao_id: cid, empresa_id: cotacao["empresa_id"] ?? null, versao, snapshot: atual, motivo: String(motivo ?? "") || null, criado_por_nome: usuarioNome || null } as never);
    if (error) return void toast.error(error.message.includes("cotacoes_versoes") ? SCRIPT : error.message);
    await supabase.from("cotacoes").update({ versao } as never).eq("id", cid);
    toast.success(`${rotuloVersao(versao)} salva.`);
    qc.invalidateQueries({ queryKey: ["cotacoes_versoes", cid] });
  }

  const detalhe = sel ? (sel["snapshot"] as SnapCotacao) : null;
  const anterior = sel ? versoes.find((v) => Number(v["versao"]) === Number(sel["versao"]) - 1) : null;
  const diffSel = detalhe && anterior ? compararCotacoes(anterior["snapshot"] as SnapCotacao, detalhe, nomeItem) : null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Revisões {ultima ? <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{rotuloVersao(ultima["versao"])}</span> : null}</h3>
        <p className="text-xs text-muted-foreground">
          {q.data?.faltaScript ? SCRIPT : !ultima ? "Nenhuma revisão salva. Salve a primeira para congelar os itens e preços atuais." : diff?.igual ? "Sem alterações desde a última revisão." : `Há alterações desde a última revisão (${diff?.itens.length ?? 0} item(ns)${diff?.precosMudaram ? " e preços" : ""}).`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!versoes.length} onClick={() => setAberto(true)}><History className="mr-1 h-4 w-4" />Histórico ({versoes.length})</Button>
        {canUpdate && <Button size="sm" onClick={() => void salvar()}><Save className="mr-1 h-4 w-4" />Salvar revisão</Button>}
      </div>

      <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setSel(null); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico de revisões</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {versoes.map((v) => (
              <button key={String(v["id"])} type="button" onClick={() => setSel(v)} className={`w-full rounded-md border p-3 text-left text-sm hover:bg-muted ${sel?.["id"] === v["id"] ? "border-primary" : ""}`}>
                <div className="flex justify-between"><b>{rotuloVersao(v["versao"])}</b><span className="text-xs text-muted-foreground">{new Date(String(v["created_at"])).toLocaleString("pt-BR")}</span></div>
                <div className="text-xs text-muted-foreground">{String(v["criado_por_nome"] ?? "")}{v["motivo"] ? ` — ${String(v["motivo"])}` : ""}</div>
              </button>
            ))}
          </div>
          {detalhe && (
            <div className="space-y-3 border-t pt-3 text-sm">
              <p className="font-semibold">Itens em {rotuloVersao(sel?.["versao"])}</p>
              <ul className="space-y-1">{detalhe.itens.map((i) => <li key={i.item_id} className="flex justify-between"><span>{nomeItem(i.item_id)}</span><span className="text-muted-foreground">{formatQtd(i.quantidade)}</span></li>)}</ul>
              {diffSel && !diffSel.igual && (
                <div>
                  <p className="font-semibold">Mudanças em relação à revisão anterior</p>
                  <ul className="space-y-1">{diffSel.itens.map((d) => <li key={d.item_id}><span className="font-medium">{d.tipo === "adicionado" ? "Incluído" : d.tipo === "removido" ? "Removido" : "Alterado"}:</span> {d.nome}{d.tipo === "alterado" ? ` (${formatQtd(d.antes ?? 0)} → ${formatQtd(d.depois ?? 0)})` : ""}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
