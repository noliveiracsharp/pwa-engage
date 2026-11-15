import { useRef, useState } from "react";
import { Download, FileUp, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Row } from "@/lib/row";
import { gerarCsv, lerCsv, MODELO, type ErroLinha, type LinhaUnidade } from "@/lib/unidades-planilha";
import { s } from "./cond-data";

function baixar(texto: string, nome: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const chave = (v: string) => v.trim().toLowerCase();

export function PlanilhaUnidadesDialog({ condominioId, blocos, unidades, onClose }: { condominioId: string; blocos: Row[]; unidades: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState("");
  const [linhas, setLinhas] = useState<LinhaUnidade[]>([]);
  const [erros, setErros] = useState<ErroLinha[]>([]);
  const [salvando, setSalvando] = useState(false);

  const blocoPorNome = new Map(blocos.map((b) => [chave(s(b["nome"])), b]));
  const existentes = new Set(unidades.map((u) => `${s(u["cond_bloco_id"])}|${chave(s(u["numero"]))}`));
  const jaExiste = (l: LinhaUnidade) => { const b = blocoPorNome.get(chave(l.bloco)); return !!b && existentes.has(`${s(b["id"])}|${chave(l.numero)}`); };
  const novas = linhas.filter((l) => !jaExiste(l));
  const blocosNovos = [...new Set(novas.map((l) => l.bloco.trim()))].filter((n) => !blocoPorNome.has(chave(n)));

  function exportar() {
    const nomeBloco = new Map(blocos.map((b) => [s(b["id"]), s(b["nome"])]));
    const ls: LinhaUnidade[] = unidades.map((u) => ({
      bloco: nomeBloco.get(s(u["cond_bloco_id"])) ?? "", numero: s(u["numero"]),
      andar: u["andar"] == null ? null : Number(u["andar"]), tipo: s(u["tipo"]) || "apartamento",
      area_privativa: u["area_privativa"] == null ? null : Number(u["area_privativa"]),
      fracao_ideal: u["fracao_ideal"] == null ? null : Number(u["fracao_ideal"]),
    })).sort((a, b) => a.bloco.localeCompare(b.bloco, "pt-BR") || a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
    baixar(gerarCsv(ls), "unidades-condominio.csv");
  }

  async function ler(f: File | undefined) {
    if (!f) return;
    const r = lerCsv(await f.text());
    setArquivo(f.name); setLinhas(r.linhas); setErros(r.erros);
  }

  async function importar() {
    setSalvando(true);
    try {
      const ids = new Map([...blocoPorNome].map(([k, b]) => [k, s(b["id"])]));
      if (blocosNovos.length) {
        const { data, error } = await supabase.from("cond_blocos" as never).insert(
          blocosNovos.map((nome, i) => ({ condominio_id: condominioId, nome, ordem: blocos.length + i })) as never,
        ).select("id, nome");
        if (error) throw error;
        for (const b of (data ?? []) as unknown as Row[]) ids.set(chave(s(b["nome"])), s(b["id"]));
      }
      const regs = novas.map((l) => ({ condominio_id: condominioId, cond_bloco_id: ids.get(chave(l.bloco)), numero: l.numero.trim(), andar: l.andar, tipo: l.tipo, area_privativa: l.area_privativa, fracao_ideal: l.fracao_ideal }));
      for (let i = 0; i < regs.length; i += 500) {
        const { error } = await supabase.from("cond_unidades" as never).insert(regs.slice(i, i + 500) as never);
        if (error) throw error;
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["cond", "cond_blocos"] }), qc.invalidateQueries({ queryKey: ["cond", "cond_unidades"] })]);
      toast.success(`${regs.length} unidades importadas${blocosNovos.length ? ` e ${blocosNovos.length} blocos criados` : ""}.`);
      onClose();
    } catch (e) {
      toast.error((e as { message?: string }).message || "Não foi possível importar.");
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Planilha de blocos e unidades</DialogTitle>
          <DialogDescription>Arquivo CSV separado por ponto e vírgula — abre no Excel, Google Planilhas e LibreOffice.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => baixar(gerarCsv(MODELO), "modelo-unidades.csv")}><Download className="size-4" /> Baixar modelo</Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!unidades.length}><Download className="size-4" /> Exportar unidades atuais</Button>
          <Button size="sm" onClick={() => input.current?.click()}><FileUp className="size-4" /> Escolher planilha</Button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Escolher planilha CSV" onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="flex gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Obrigatórias: <b>Bloco</b> e <b>Unidade</b>. Opcionais: Andar (deduzido de 101, 1203…), Tipo (apartamento, casa, cobertura, loja, sala, vaga_autonoma, outro), Área privativa e Fração ideal. Blocos novos são criados; unidades já existentes são ignoradas. No Excel, salve como “CSV UTF-8”.</span>
        </p>
        {arquivo && (
          <div className="space-y-2 text-sm" aria-live="polite">
            <p className="font-medium">{arquivo}</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <li className="rounded-md border p-2"><span className="block text-lg font-semibold">{novas.length}</span>unidades novas</li>
              <li className="rounded-md border p-2"><span className="block text-lg font-semibold">{blocosNovos.length}</span>blocos novos</li>
              <li className="rounded-md border p-2"><span className="block text-lg font-semibold">{linhas.length - novas.length}</span>já existentes</li>
              <li className="rounded-md border p-2"><span className="block text-lg font-semibold text-destructive">{erros.length}</span>linhas com erro</li>
            </ul>
            {erros.length > 0 && (
              <ul className="max-h-40 overflow-auto rounded-md border border-destructive/40 p-2 text-xs text-destructive">
                {erros.map((e) => <li key={e.linha}>Linha {e.linha}: {e.mensagem}</li>)}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={importar} disabled={salvando || !novas.length}>{salvando ? "Importando…" : `Importar ${novas.length} unidades`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
