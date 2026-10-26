import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, Link2, Loader2, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { formatBRL } from "@/lib/orcamentos";
import { cruzarDda, lerCnabDda, type TituloPagar } from "@/lib/dda";
import type { Row } from "@/lib/row";

type Perms = { canCreate: boolean; canUpdate: boolean };
const fmtData = (d: unknown) => (text(d) ? text(d).slice(0, 10).split("-").reverse().join("/") : "—");
const SEM_TABELA = /financeiro_dda|schema cache|does not exist/i;

export function DdaInbox({ titulos, perms }: { titulos: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { data: ddaRaw = [], error } = useTableRows("financeiro_dda");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const [lendo, setLendo] = useState(false);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"pendente" | "conciliado" | "ignorado" | "todos">("pendente");

  const parcDocs = useMemo(() => parceiros.map((p) => ({ id: text(rowId(p)), documento: text(p["documento"]) })), [parceiros]);
  const nomeParc = useMemo(() => new Map(parceiros.map((p) => [text(rowId(p)), text(p["nome_fantasia"] || p["razao_social"])])), [parceiros]);
  const tits = useMemo<TituloPagar[]>(() => titulos.map((t) => ({
    id: text(rowId(t)), parceiro_id: text(t["parceiro_id"]), valor: Number(t["valor"]), vencimento: text(t["vencimento"]),
    status: text(t["status"]), tipo: text(t["tipo"]),
  })), [titulos]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ddaRaw
      .filter((d) => status === "todos" || text(d["status"]) === status)
      .filter((d) => !q || [d["cedente_nome"], d["cedente_documento"], d["linha_digitavel"]].some((v) => text(v).toLowerCase().includes(q)))
      .map((d) => {
        const m = cruzarDda({ cedente_documento: text(d["cedente_documento"]), valor: Number(d["valor"]), vencimento: text(d["vencimento"]) }, parcDocs, tits);
        return { d, ...m };
      })
      .sort((a, b) => text(a.d["vencimento"]).localeCompare(text(b.d["vencimento"])));
  }, [ddaRaw, busca, status, parcDocs, tits]);

  const recarregar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["table", "financeiro_dda"] }),
    qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] }),
  ]);

  const importar = async (f: File) => {
    setLendo(true);
    try {
      const boletos = lerCnabDda(await f.text());
      if (!boletos.length) return void toast.error("Nenhum boleto DDA encontrado. Confira se o arquivo é CNAB 240 DDA (segmento G).");
      const { error: e } = await supabase.from("financeiro_dda" as never)
        .upsert(boletos.map((b) => ({ ...b, empresa_id: empresaId, vencimento: b.vencimento || null, arquivo: f.name })) as never,
          { onConflict: "empresa_id,codigo_barras", ignoreDuplicates: true });
      if (e) throw e;
      toast.success(`${boletos.length} boleto(s) lido(s) do arquivo.`);
      await recarregar();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      toast.error(SEM_TABELA.test(msg) ? "Rode o script atendeai-dda.sql no SQL Editor antes de importar." : msg);
    } finally { setLendo(false); }
  };

  const mudar = async (id: unknown, patch: Record<string, unknown>) => {
    const { error: e } = await supabase.from("financeiro_dda" as never).update(patch as never).eq("id", text(id));
    if (e) return void toast.error(e.message);
    await recarregar();
  };

  const vincular = async (d: Row, tituloId: string) => {
    const { error: e } = await supabase.from("financeiro_titulos").update({ linha_digitavel: text(d["linha_digitavel"]) } as never).eq("id", tituloId);
    if (e) return void toast.error(e.message);
    await mudar(rowId(d), { status: "conciliado", titulo_id: tituloId });
    toast.success("Código de barras vinculado à conta a pagar.");
  };

  const lancar = async (d: Row, parceiroId: string | null) => {
    if (!parceiroId) return void toast.error("Fornecedor não cadastrado. Cadastre o CNPJ em Parceiros primeiro.");
    const venc = text(d["vencimento"]) || new Date().toISOString().slice(0, 10);
    const { data, error: e } = await supabase.from("financeiro_titulos").insert({
      tipo: "pagar", empresa_id: empresaId, origem_tipo: "manual", parcela_n: 1, status: "aberto",
      descricao: `Boleto DDA - ${text(d["cedente_nome"]) || nomeParc.get(parceiroId) || "Fornecedor"}`,
      parceiro_id: parceiroId, forma_pagamento: "Boleto", linha_digitavel: text(d["linha_digitavel"]),
      data_competencia: venc, vencimento: venc, valor: Number(d["valor"]),
    } as never).select("id").single();
    if (e) return void toast.error(e.message);
    await mudar(rowId(d), { status: "conciliado", titulo_id: (data as { id: string }).id });
    toast.success("Conta a pagar lançada.");
  };

  const semTabela = error && SEM_TABELA.test((error as Error).message ?? "");
  const pode = perms.canCreate || perms.canUpdate;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por fornecedor, CNPJ ou linha digitável" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <div className="flex gap-1">
          {(["pendente", "conciliado", "ignorado", "todos"] as const).map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {{ pendente: "Pendentes", conciliado: "Conciliados", ignorado: "Ignorados", todos: "Todos" }[s]}
            </Button>
          ))}
        </div>
        {pode && (
          <label className="ml-auto">
            <Button asChild size="sm" disabled={lendo}>
              <span className="cursor-pointer">{lendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />}Importar arquivo DDA</span>
            </Button>
            <input type="file" accept=".ret,.dda,.txt,.rem,text/plain" className="hidden" disabled={lendo}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importar(f); }} />
          </label>
        )}
      </div>
      <p className="text-muted-foreground text-sm">Baixe no internet banking o arquivo DDA (CNAB 240) com os boletos emitidos contra o CNPJ da empresa e importe aqui. O sistema reconhece o fornecedor e a conta a pagar automaticamente.</p>

      {semTabela ? (
        <p className="text-warning text-sm">Rode o script <strong>atendeai-dda.sql</strong> no SQL Editor para ativar o DDA.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Vencimento</th><th className="p-2">Fornecedor (cedente)</th><th className="p-2 text-right">Valor</th><th className="p-2">Situação</th><th className="p-2 text-right">Ações</th></tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={5} className="text-muted-foreground p-6 text-center">Nenhum boleto DDA {status !== "todos" ? "nesta situação" : ""}.</td></tr>}
              {linhas.map(({ d, parceiroId, tituloId }) => {
                const st = text(d["status"]);
                return (
                  <tr key={text(rowId(d))} className="border-t">
                    <td className="p-2 whitespace-nowrap">{fmtData(d["vencimento"])}</td>
                    <td className="p-2">
                      <div className="font-medium">{(parceiroId && nomeParc.get(parceiroId)) || text(d["cedente_nome"]) || "—"}</div>
                      <div className="text-muted-foreground font-mono text-xs">{text(d["cedente_documento"])}</div>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">{formatBRL(Number(d["valor"]))}</td>
                    <td className="p-2">
                      {st === "conciliado" ? <Badge className="bg-success/15 text-success">Conciliado</Badge>
                        : st === "ignorado" ? <Badge variant="outline">Ignorado</Badge>
                        : tituloId ? <Badge className="bg-success/15 text-success">Já lançado</Badge>
                        : parceiroId ? <Badge className="bg-warning/15 text-warning">Novo boleto</Badge>
                        : <Badge className="bg-destructive/10 text-destructive">Fornecedor desconhecido</Badge>}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {st === "pendente" && pode && (
                        <div className="flex justify-end gap-1">
                          {tituloId
                            ? <Button size="sm" variant="outline" onClick={() => void vincular(d, tituloId)}><Link2 className="mr-1 h-4 w-4" />Vincular</Button>
                            : <Button size="sm" variant="outline" disabled={!parceiroId} onClick={() => void lancar(d, parceiroId)}><Plus className="mr-1 h-4 w-4" />Lançar a pagar</Button>}
                          <Button size="sm" variant="ghost" onClick={() => void mudar(rowId(d), { status: "ignorado" })}><XCircle className="mr-1 h-4 w-4" />Ignorar</Button>
                        </div>
                      )}
                      {st !== "pendente" && pode && (
                        <Button size="sm" variant="ghost" onClick={() => void mudar(rowId(d), { status: "pendente", titulo_id: null })}><CheckCircle2 className="mr-1 h-4 w-4" />Reabrir</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
