import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, CalendarDays, Car, KeyRound, Loader2, Megaphone, Package, PawPrint, ShieldAlert, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { acaoLocacao } from "@/lib/cond-unidade";
import { cn } from "@/lib/utils";
import { s, useCondRows } from "./cond-data";

type Perms = { canUpdate: boolean };
type Pessoa = { usuario_id: string; nome: string };
type Props = { unidadeId: string; condominioId: string; ocupacao: string; perms: Perms; onOcupacao: (o: string) => void; onIr: (aba: string) => void };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;

export function PainelUnidade({ unidadeId, condominioId, ocupacao, perms, onOcupacao, onIr }: Props) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const { data: vinculos = [] } = useCondRows("cond_unidades_vinculos", "cond_unidade_id", unidadeId);
  const { data: veiculos = [] } = useCondRows("cond_unidades_veiculos", "cond_unidade_id", unidadeId);
  const { data: pets = [] } = useCondRows("cond_unidades_pets", "cond_unidade_id", unidadeId);
  const { data: vagas = [] } = useCondRows("cond_vagas", "condominio_id", condominioId);
  const { data: cfg = [] } = useCondRows("cond_config", "condominio_id", condominioId);
  const { data: pessoas = [] } = useQuery({
    queryKey: ["cond", "cond_unidades_vinculos", "pessoas", unidadeId],
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await rpc("cond_unidade_pessoas", { p_unidade: unidadeId });
      if (error) throw new Error(error.message);
      return (data ?? []) as Pessoa[];
    },
  });
  const nome = (uid: unknown) => pessoas.find((p) => p.usuario_id === s(uid))?.nome ?? "—";
  const ativos = vinculos.filter((v) => v["arquivado"] !== true);
  const guardados = vinculos.filter((v) => v["arquivado"] === true);
  const titulares = ativos.filter((v) => ["proprietario", "inquilino"].includes(s(v["papel"])));
  const financeiros = ativos.filter((v) => v["is_responsavel_financeiro"] === true);
  const veicAtivos = veiculos.filter((v) => v["status"] !== false && v["arquivado"] !== true).length;
  const lim = cfg[0]?.["limite_veiculos_ativos"];
  const minhasVagas = vagas.filter((v) => s(v["cond_unidade_id"]) === unidadeId).length;
  const proxima = acaoLocacao(ocupacao);

  async function locacao() {
    if (!proxima) return;
    const ok = await confirmar(proxima === "iniciar" ? {
      title: "Registrar locação desta unidade?",
      description: "A família, os visitantes, os prestadores e os veículos do proprietário ficam guardados (não são apagados). O proprietário continua como titular. Depois, cadastre o inquilino na aba Inquilino.",
      confirmText: "Registrar locação",
    } : {
      title: "Encerrar a locação?",
      description: "O inquilino e a família dele ficam guardados no histórico da unidade, e os cadastros do proprietário voltam a valer.",
      destructive: true, confirmText: "Encerrar locação",
    });
    if (!ok) return;
    setOcupado(true);
    try {
      const { error } = await rpc("cond_unidade_locacao", { p_unidade: unidadeId, p_acao: proxima });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["cond"] });
      onOcupacao(proxima === "iniciar" ? "alugada" : "propria");
      toast.success(proxima === "iniciar" ? "Locação registrada. Cadastre o inquilino." : "Locação encerrada. Cadastros do proprietário reativados.");
      if (proxima === "iniciar") onIr("inquilino");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setOcupado(false); }
  }

  const ocupL = ocupacao === "alugada" ? "Alugada" : ocupacao === "propria" ? "Própria" : "Vazia";
  const cards = [
    { i: Users, l: "Pessoas ativas", n: String(ativos.length), aba: "proprietario" },
    { i: Car, l: "Veículos liberados", n: lim === null || lim === undefined ? String(veicAtivos) : `${veicAtivos}/${s(lim)}`, aba: "veiculos" },
    { i: KeyRound, l: "Vagas", n: String(minhasVagas), aba: "dados" },
    { i: PawPrint, l: "Pets", n: String(pets.length), aba: "pets" },
  ];
  const emBreve = [
    { i: CalendarDays, l: "Agendamentos" },
    { i: Megaphone, l: "Anúncios" },
    { i: Package, l: "Encomendas" },
    { i: ShieldAlert, l: "Ocorrências" },
  ];

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Ocupação</p>
          <p className="flex items-center gap-2 text-lg font-semibold">{ocupL}
            {guardados.length > 0 && <Badge variant="outline"><Archive className="mr-1 size-3" /> {guardados.length} guardado(s)</Badge>}</p>
        </div>
        {perms.canUpdate && proxima && (
          <Button variant={proxima === "encerrar" ? "outline" : "default"} disabled={ocupado} onClick={locacao}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {proxima === "iniciar" ? "Registrar locação" : "Encerrar locação"}
          </Button>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <button key={c.l} type="button" onClick={() => onIr(c.aba)}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><c.i className="size-4" /></span>
            <span><span className="block text-lg font-bold leading-none tabular-nums">{c.n}</span><span className="text-xs text-muted-foreground">{c.l}</span></span>
          </button>
        ))}
      </div>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Titulares e responsáveis</h3>
        {titulares.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum titular cadastrado.</p> : (
          <ul className="space-y-2">
            {titulares.map((v) => (
              <li key={s(v["id"])} className="flex flex-wrap items-center gap-2 text-sm">
                <UserRound className="size-4 text-muted-foreground" /> <span className="font-medium">{nome(v["usuario_id"])}</span>
                <Badge variant="secondary">{s(v["papel"]) === "inquilino" ? "Inquilino" : "Proprietário"}</Badge>
                {v["is_residente"] === true && <Badge variant="outline">Reside</Badge>}
                {v["is_responsavel_financeiro"] === true && <Badge variant="outline">Responsável financeiro</Badge>}
              </li>
            ))}
          </ul>
        )}
        {financeiros.length === 0 && titulares.length > 0 && <p className="mt-2 text-xs text-warning">Nenhum responsável financeiro marcado. Ajuste em Permissões.</p>}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Atividade da unidade</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {emBreve.map((x) => (
            <div key={x.l} className={cn("flex items-center gap-3 rounded-lg border border-dashed p-3")}>
              <x.i className="size-4 text-muted-foreground" />
              <span><span className="block text-sm font-medium">{x.l}</span><span className="text-xs text-muted-foreground">Em breve</span></span>
            </div>
          ))}
        </div>
      </section>

      {guardados.length > 0 && (
        <section className="rounded-xl border border-dashed bg-muted/30 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Archive className="size-4" /> Cadastros guardados</h3>
          <p className="mb-2 text-xs text-muted-foreground">Ficam disponíveis para a administração e voltam a valer ao encerrar a locação.</p>
          <ul className="flex flex-wrap gap-2">
            {guardados.map((v) => <li key={s(v["id"])}><Badge variant="outline">{nome(v["usuario_id"])} · {s(v["papel"])}</Badge></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
