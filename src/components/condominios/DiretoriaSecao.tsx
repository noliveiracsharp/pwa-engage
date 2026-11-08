import { useMemo, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/row";
import { FUNCOES_DIRETIVAS_UNIDADE } from "@/lib/cond-equipe";
import { AcaoIcone } from "./AcaoIcone";
import { s, useCondRows } from "./cond-data";

// Síndico é definido na Sindicatura acima; aqui fica o restante do corpo diretivo.
const FUNCOES = ["subsindico", "conselheiro_consultivo", "conselheiro_fiscal"] as const;
const UNICAS = new Set(["subsindico"]);
const alfa = <T extends { label: string }>(l: T[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

/**
 * Corpo diretivo indicado a partir das unidades: a função fica gravada no próprio
 * vínculo do morador, então a ficha da unidade e esta tela mostram sempre o mesmo dado.
 */
export function DiretoriaSecao({ condominioId, podeEditar }: { condominioId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const { data: unidades = [] } = useCondRows("cond_unidades", "condominio_id", condominioId);
  const { data: blocos = [] } = useCondRows("cond_blocos", "condominio_id", condominioId);
  const unidadeIds = useMemo(() => unidades.map((u) => s(u["id"])).filter(Boolean), [unidades]);
  const rotuloUnidade = (id: string) => {
    const u = unidades.find((x) => s(x["id"]) === id);
    return u ? `${s(blocos.find((b) => s(b["id"]) === s(u["cond_bloco_id"]))?.["nome"])} — ${s(u["numero"])}` : "—";
  };
  const unidadeOpts = alfa(unidades.map((u) => ({ value: s(u["id"]), label: rotuloUnidade(s(u["id"])) })));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: membros = [] } = useQuery({
    queryKey: ["cond", "cond_unidades_vinculos", "diretoria-gestao", condominioId, unidadeIds.join(",")],
    enabled: unidadeIds.length > 0,
    queryFn: async (): Promise<Row[]> => {
      const { data: vs } = await db.from("cond_unidades_vinculos").select("id,cond_unidade_id,usuario_id,funcao_condominio").in("cond_unidade_id", unidadeIds).in("funcao_condominio", [...FUNCOES]);
      if (!vs?.length) return [];
      const pessoas = new Map<string, Row>();
      await Promise.all([...new Set(vs.map((v: Row) => s(v["cond_unidade_id"])))].map(async (u) => {
        const { data } = await db.rpc("cond_unidade_pessoas", { p_unidade: u });
        for (const p of (data ?? []) as Row[]) pessoas.set(s(p["usuario_id"]), p);
      }));
      return vs.map((v: Row) => {
        const p = pessoas.get(s(v["usuario_id"]));
        return { ...v, nome: s(p?.["nome"]) || s(p?.["email"]) || "—" };
      });
    },
  });

  const [funcao, setFuncao] = useState("");
  const [unidade, setUnidade] = useState("");
  const [pessoa, setPessoa] = useState("");
  const { data: vincUnidade = [] } = useCondRows("cond_unidades_vinculos", "cond_unidade_id", unidade || undefined);
  const { data: pessoas = [] } = useQuery({
    queryKey: ["cond", "diretoria-pessoas", unidade, vincUnidade.map((x) => s(x["usuario_id"])).join(",")],
    enabled: vincUnidade.length > 0 && !!unidade,
    queryFn: async () => {
      const { data } = await db.rpc("cond_unidade_pessoas", { p_unidade: unidade });
      return ((data ?? []) as Row[]).map((p): Row => ({ ...p, id: s(p["usuario_id"]) }));
    },
  });
  const pessoaOpts = alfa(pessoas.map((p) => ({ value: s(p["id"]), label: s(p["nome"]) || s(p["email"]) })));
  const funcaoOpts = alfa(FUNCOES.map((f) => ({ value: f, label: FUNCOES_DIRETIVAS_UNIDADE[f]!.label })));

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["cond", "cond_unidades_vinculos"] });
    void qc.invalidateQueries({ queryKey: ["ambientes"] });
  };

  async function indicar() {
    if (!funcao || !unidade || !pessoa) { toast.error("Escolha a função, a unidade e o morador."); return; }
    const vi = vincUnidade.find((x) => s(x["usuario_id"]) === pessoa);
    if (s(vi?.["funcao_condominio"]) === "sindico") { toast.error("Este morador é o síndico. Troque o síndico na Sindicatura antes."); return; }
    if (UNICAS.has(funcao)) {
      await db.from("cond_unidades_vinculos").update({ funcao_condominio: "condomino" }).in("cond_unidade_id", unidadeIds).eq("funcao_condominio", funcao);
    }
    const { data, error } = await db.from("cond_unidades_vinculos").update({ funcao_condominio: funcao }).eq("cond_unidade_id", unidade).eq("usuario_id", pessoa).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Nada foi gravado: seu perfil não tem permissão para alterar esta unidade."); return; }
    toast.success("Função gravada também no cadastro da unidade.");
    setFuncao(""); setUnidade(""); setPessoa("");
    recarregar();
  }

  async function remover(m: Row) {
    if (!(await confirmar({ title: `Retirar ${s(m["nome"])} do corpo diretivo?`, description: "A pessoa continua na unidade, apenas como condômina.", destructive: true, confirmText: "Retirar" }))) return;
    const { error } = await db.from("cond_unidades_vinculos").update({ funcao_condominio: "condomino" }).eq("id", s(m["id"]));
    if (error) { toast.error(error.message); return; }
    toast.success("Removido do corpo diretivo.");
    recarregar();
  }

  const ordenados = [...membros].sort((a, b) => (FUNCOES_DIRETIVAS_UNIDADE[s(a["funcao_condominio"])]?.ordem ?? 9) - (FUNCOES_DIRETIVAS_UNIDADE[s(b["funcao_condominio"])]?.ordem ?? 9) || s(a["nome"]).localeCompare(s(b["nome"]), "pt-BR"));

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" /> Corpo diretivo</h2>
        <p className="text-xs text-muted-foreground">Subsíndico e conselhos indicados aqui ficam gravados na ficha da unidade (e vice-versa). Sem cadastro duplicado.</p>
      </div>
      {ordenados.length === 0 ? <p className="text-sm text-muted-foreground">Ninguém indicado ainda.</p> : (
        <ul className="divide-y rounded-md border">
          {ordenados.map((m) => (
            <li key={s(m["id"])} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s(m["nome"])}</p>
                <p className="truncate text-xs text-muted-foreground">{FUNCOES_DIRETIVAS_UNIDADE[s(m["funcao_condominio"])]?.label} · {rotuloUnidade(s(m["cond_unidade_id"]))}</p>
              </div>
              {podeEditar && <AcaoIcone titulo="Retirar do corpo diretivo" destrutivo onClick={() => remover(m)}><Trash2 className="size-4" /></AcaoIcone>}
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="min-w-0"><Label className="mb-1.5 block">Função</Label><SearchSelect value={funcao} onChange={setFuncao} options={funcaoOpts} placeholder="Selecione" /></div>
          <div className="min-w-0"><Label className="mb-1.5 block">Unidade</Label><SearchSelect value={unidade} onChange={(x) => { setUnidade(x); setPessoa(""); }} options={unidadeOpts} placeholder="Selecione" /></div>
          <div className="min-w-0"><Label className="mb-1.5 block">Morador</Label><SearchSelect value={pessoa} onChange={setPessoa} options={pessoaOpts} disabled={!unidade} placeholder={unidade && !pessoaOpts.length ? "Nenhum morador" : "Selecione"} /></div>
          <Button onClick={indicar}><Plus className="size-4" /> Indicar</Button>
        </div>
      )}
    </section>
  );
}
