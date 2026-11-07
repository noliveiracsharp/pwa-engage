import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Accessibility, Ban, IdCard, Loader2, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { formatCpfCnpj } from "@/lib/input-masks";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import {
  ACESSIBILIDADE, GENEROS, funcaoPadrao, funcoesDoPapel, podeDelegarSindico, STATUS_CONEXAO, exigeAceite, isoParaBr,
  preferenciasDoPapel, valoresPreferencias, type PreferenciaCatalogo,
} from "@/lib/cond-pessoa";
import { CampoData } from "./CampoData";
import { DIAS_SEMANA, TIPOS_SERVICO, copiarParaUteis, errosAgenda, normalizarAgenda, sincronizaFacial, type DiaKey } from "@/lib/cond-acesso";
import { CalendarClock, Copy, ScanFace } from "lucide-react";
import { FotoCond } from "./FotoCond";
import { PAPEIS, s } from "./cond-data";

export type Pessoa = {
  usuario_id: string; nome: string; email: string; celular: string | null; cpf: string | null; foto_url?: string | null; tem_acesso: boolean;
  genero?: string | null; data_nascimento?: string | null; profissao?: string | null; rg?: string | null; rg_orgao?: string | null;
  passaporte?: string | null; acessibilidade?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;

function usePreferenciasCatalogo() {
  return useQuery({
    queryKey: ["cond", "catalogo", "cond_preferencias_catalogo"],
    queryFn: async (): Promise<PreferenciaCatalogo[]> => {
      const { data, error } = await db.from("cond_preferencias_catalogo").select("chave,descricao,publico,padrao,ordem").eq("ativo", true).order("ordem");
      if (error) return [];
      return data ?? [];
    },
  });
}

function useProfissoes() {
  return useQuery({
    queryKey: ["cond", "catalogo", "cond_profissoes"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db.from("cond_profissoes").select("titulo").order("titulo").limit(5000);
      if (error) return [];
      return (data ?? []).map((r: Row) => s(r["titulo"]));
    },
  });
}

type Props = {
  unidadeId: string; lado: string; papeis: string[]; gestor: boolean;
  pessoa?: Pessoa | null; vinculo?: Row | null;
  onClose: () => void; onSalvo: () => Promise<unknown>;
};

/** Cadastro completo da pessoa na unidade (novo ou edição), em abas. */
export function PessoaDialog({ unidadeId, lado, papeis, gestor, pessoa, vinculo, onClose, onSalvo }: Props) {
  const novo = !pessoa;
  const { data: catalogo = [] } = usePreferenciasCatalogo();
  const { data: profissoes = [] } = useProfissoes();
  const [d, setD] = useState({
    nome: pessoa?.nome ?? "", email: pessoa?.email ?? "", celular: pessoa?.celular ?? "", cpf: formatCpfCnpj(pessoa?.cpf ?? ""),
    foto_url: pessoa?.foto_url ?? "", genero: pessoa?.genero ?? "", data_nascimento: pessoa?.data_nascimento ?? "",
    profissao: pessoa?.profissao ?? "", rg: pessoa?.rg ?? "", rg_orgao: pessoa?.rg_orgao ?? "", passaporte: pessoa?.passaporte ?? "",
    acessibilidade: pessoa?.acessibilidade ?? "",
  });
  const [vi, setVi] = useState({
    papel: s(vinculo?.["papel"]) || papeis[0]!,
    extra: s(vinculo?.["parentesco"]) || s(vinculo?.["prestador_funcao"]),
    controle_acesso: vinculo ? vinculo["controle_acesso"] !== false : true,
    status_conexao: s(vinculo?.["status_conexao"]) || "ativo",
    funcao_condominio: funcaoPadrao(s(vinculo?.["papel"]) || papeis[0]!, s(vinculo?.["funcao_condominio"])),
    sindico_delegado: vinculo?.["sindico_delegado"] === true,
    sindico_ate: s(vinculo?.["sindico_ate"]),
    anunciado_portaria: vinculo ? vinculo["anunciado_portaria"] !== false : true,
    acesso_agenda: normalizarAgenda(vinculo?.["acesso_agenda"]),
    acesso_inicio: s(vinculo?.["acesso_inicio"]), acesso_fim: s(vinculo?.["acesso_fim"]),
    tipo_servico: s(vinculo?.["tipo_servico"]), servico_descricao: s(vinculo?.["servico_descricao"]),
    telefone_fixo: s(vinculo?.["telefone_fixo"]),
  });
  const temAgenda = ["prestador", "colaborador", "visitante"].includes(vi.papel);
  const erros = temAgenda && !vi.anunciado_portaria ? errosAgenda(vi.acesso_agenda) : [];
  const periodoInvalido = !!(vi.acesso_inicio && vi.acesso_fim && vi.acesso_fim < vi.acesso_inicio);
  const facial = temAgenda ? sincronizaFacial({ controle: vi.controle_acesso, anunciado: vi.anunciado_portaria, agenda: vi.acesso_agenda, fim: vi.acesso_fim }) : vi.controle_acesso;
  const setDia = (k: DiaKey, f: Partial<{ ativo: boolean; entrada: string; saida: string }>) =>
    setVi({ ...vi, acesso_agenda: { ...vi.acesso_agenda, [k]: { ...vi.acesso_agenda[k], ...f } } });
  const salvas = (vinculo?.["preferencias"] ?? {}) as Record<string, unknown>;
  const prefsPapel = useMemo(() => preferenciasDoPapel(catalogo, vi.papel), [catalogo, vi.papel]);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const prefsAtuais = prefs ?? valoresPreferencias(catalogo, salvas);
  const aceitoEm = s(vinculo?.["regimento_aceito_em"]);
  const precisaAceite = exigeAceite(vi.papel, aceitoEm);
  const [aceite, setAceite] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const extraLabel = vi.papel === "prestador" ? "Função (diarista, babá…)" : ["familiar", "visitante", "colaborador"].includes(vi.papel) ? "Grau de parentesco / vínculo" : "";
  const profOpts = useMemo(() => {
    const l = profissoes.map((p) => ({ value: p, label: p }));
    if (d.profissao && !profissoes.includes(d.profissao)) l.push({ value: d.profissao, label: d.profissao });
    return l;
  }, [profissoes, d.profissao]);
  const valido = d.nome.trim() && d.email.includes("@") && (!precisaAceite || aceite) && erros.length === 0 && !periodoInvalido;

  async function salvar() {
    setSalvando(true);
    try {
      let uid = pessoa?.usuario_id ?? "";
      if (novo) {
        const r = await rpc("cond_morador_vincular", {
          p_unidade: unidadeId, p_nome: d.nome, p_email: d.email, p_celular: d.celular, p_cpf: d.cpf, p_papel: vi.papel, p_lado: lado,
          p_extra: { ...(vi.papel === "prestador" ? { prestador_funcao: vi.extra } : { parentesco: vi.extra }), foto_url: d.foto_url },
        });
        if (r.error) throw new Error(r.error.message);
        uid = String(r.data);
      }
      const p = await rpc("cond_pessoa_salvar", { p_usuario: uid, p_dados: d });
      if (p.error) {
        if (/administrativos/i.test(p.error.message)) toast.info("Dados pessoais de usuários administrativos são alterados em Usuários.");
        else if (/function|schema cache/i.test(p.error.message)) throw new Error("Rode o script atendeai-condominios-cadastro-completo.sql no banco para salvar os novos campos.");
        else throw new Error(p.error.message);
      }
      let vincId = s(vinculo?.["id"]);
      if (!vincId) {
        const { data } = await db.from("cond_unidades_vinculos").select("id").eq("cond_unidade_id", unidadeId).eq("usuario_id", uid).maybeSingle();
        vincId = s(data?.id);
      }
      if (vincId) {
        const valores: Row = {
          papel: vi.papel,
          parentesco: vi.papel === "prestador" ? null : vi.extra || null,
          prestador_funcao: vi.papel === "prestador" ? vi.extra || null : null,
          controle_acesso: vi.controle_acesso,
          preferencias: { ...salvas, ...prefsAtuais },
        };
        if (temAgenda) Object.assign(valores, {
          anunciado_portaria: vi.anunciado_portaria, acesso_agenda: vi.acesso_agenda,
          acesso_inicio: vi.acesso_inicio || null, acesso_fim: vi.acesso_fim || null,
          tipo_servico: vi.tipo_servico || null, servico_descricao: vi.servico_descricao || null,
          telefone_fixo: vi.telefone_fixo || null, facial_sincronizar: facial,
        });
        if (gestor) Object.assign(valores, {
          status_conexao: vi.status_conexao, funcao_condominio: funcaoPadrao(vi.papel, vi.funcao_condominio),
          sindico_delegado: podeDelegarSindico(vi.papel) && vi.sindico_delegado,
          sindico_ate: podeDelegarSindico(vi.papel) && vi.sindico_delegado ? vi.sindico_ate || null : null,
        });
        if (precisaAceite && aceite) {
          const { data: u } = await supabase.auth.getUser();
          Object.assign(valores, { regimento_aceito_em: new Date().toISOString(), regimento_aceito_por: u.user?.id ?? null });
        }
        const { error } = await db.from("cond_unidades_vinculos").update(valores).eq("id", vincId);
        if (error) throw new Error(/column/i.test(error.message) ? "Rode o script atendeai-condominios-acesso-prestadores.sql no banco para salvar os novos campos." : error.message);
      }
      toast.success(novo ? "Pessoa cadastrada." : "Cadastro atualizado.");
      await onSalvo(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col">
        <DialogHeader><DialogTitle>{novo ? "Adicionar pessoa" : `Editar · ${pessoa?.nome}`}</DialogTitle></DialogHeader>
        <Tabs defaultValue="dados" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-auto w-fit flex-wrap justify-start">
            <TabsTrigger value="dados"><UserRound className="mr-1 size-4" /> Dados</TabsTrigger>
            <TabsTrigger value="docs"><IdCard className="mr-1 size-4" /> Documentos & acesso</TabsTrigger>
            {temAgenda && <TabsTrigger value="agenda"><CalendarClock className="mr-1 size-4" /> Dias & horários</TabsTrigger>}
            <TabsTrigger value="prefs"><SlidersHorizontal className="mr-1 size-4" /> Preferências</TabsTrigger>
            {gestor && <TabsTrigger value="gestao"><ShieldCheck className="mr-1 size-4" /> Status & função</TabsTrigger>}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1">
            <TabsContent value="dados" className="mt-0">
              <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
                <FotoCond rosto value={d.foto_url} onChange={(u) => setD({ ...d, foto_url: u })} alt={d.nome || "Foto"} />
                <div className="grid content-start gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label htmlFor="pd-nome" className="mb-1.5 block">Nome completo *</Label><Input id="pd-nome" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label htmlFor="pd-email" className="mb-1.5 block">E-mail * (login)</Label><Input id="pd-email" type="email" disabled={!novo} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></div>
                  <div><Label className="mb-1.5 block">Gênero</Label><SearchSelect value={d.genero} options={GENEROS} onChange={(x) => setD({ ...d, genero: x })} /></div>
                  <div><Label htmlFor="pd-nasc" className="mb-1.5 block">Data de nascimento</Label><CampoData id="pd-nasc" nascimento value={d.data_nascimento} onChange={(x) => setD({ ...d, data_nascimento: x })} /></div>
                  <div className="sm:col-span-2"><Label htmlFor="pd-cel" className="mb-1.5 block">Celular</Label><PhoneInput id="pd-cel" value={d.celular} onChange={(x) => setD({ ...d, celular: x })} /></div>
                  <div><Label className="mb-1.5 block">Profissão</Label><SearchSelect value={d.profissao} options={profOpts} placeholder="Pesquisar profissão (CBO)" emptyText="Profissão não encontrada." onChange={(x) => setD({ ...d, profissao: x })} /></div>
                  {papeis.length > 1 && <div><Label className="mb-1.5 block">Papel</Label><SearchSelect value={vi.papel} allowClear={false} onChange={(x) => { setVi({ ...vi, papel: x }); setPrefs(null); }} options={PAPEIS.filter((p) => papeis.includes(p.value))} /></div>}
                  {extraLabel && <div><Label htmlFor="pd-extra" className="mb-1.5 block">{extraLabel}</Label><Input id="pd-extra" value={vi.extra} onChange={(e) => setVi({ ...vi, extra: e.target.value })} /></div>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="docs" className="mt-0 space-y-4">
              <p className="text-sm text-muted-foreground">Documentos usados pela portaria e pelos leitores de controle de acesso.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="pd-cpf">CPF</Label><Input id="pd-cpf" inputMode="numeric" placeholder="000.000.000-00" value={d.cpf} onChange={(e) => setD({ ...d, cpf: formatCpfCnpj(e.target.value).slice(0, 14) })} /></div>
                <div><Label htmlFor="pd-pass">Passaporte</Label><Input id="pd-pass" maxLength={20} value={d.passaporte} onChange={(e) => setD({ ...d, passaporte: e.target.value.toUpperCase() })} /></div>
                <div><Label htmlFor="pd-rg">RG</Label><Input id="pd-rg" maxLength={20} value={d.rg} onChange={(e) => setD({ ...d, rg: e.target.value.toUpperCase() })} /></div>
                <div><Label htmlFor="pd-rgo">Órgão emissor / UF</Label><Input id="pd-rgo" maxLength={15} placeholder="SSP/SP" value={d.rg_orgao} onChange={(e) => setD({ ...d, rg_orgao: e.target.value.toUpperCase() })} /></div>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span><span className="block text-sm font-medium">Liberado no controle de acesso</span><span className="text-xs text-muted-foreground">Envia foto e documentos para o leitor facial e a catraca da portaria.</span></span>
                <Switch checked={vi.controle_acesso} onCheckedChange={(c) => setVi({ ...vi, controle_acesso: c })} />
              </label>
            </TabsContent>

            {temAgenda && (
              <TabsContent value="agenda" className="mt-0 space-y-4">
                {vi.papel !== "visitante" && (
                  <section className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                    <div><Label className="mb-1.5 block">Tipo de serviço</Label><SearchSelect value={vi.tipo_servico} options={TIPOS_SERVICO} onChange={(x) => setVi({ ...vi, tipo_servico: x })} />
                      {vi.tipo_servico === "personal" && <p className="mt-1 text-xs text-destructive">Personal Trainer: anexe o CREF em Documentos.</p>}</div>
                    <div><Label htmlFor="pd-fixo">Telefone fixo</Label><PhoneInput id="pd-fixo" value={vi.telefone_fixo} onChange={(x) => setVi({ ...vi, telefone_fixo: x })} /></div>
                    <div className="sm:col-span-2"><Label htmlFor="pd-desc">Descritivo do serviço</Label><Input id="pd-desc" value={vi.servico_descricao} onChange={(e) => setVi({ ...vi, servico_descricao: e.target.value })} /></div>
                  </section>
                )}
                <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <span><span className="block text-sm font-medium">Deve ser anunciado(a) pela portaria</span><span className="text-xs text-muted-foreground">Ligado: a entrada não é liberada automaticamente e a facial não é enviada aos leitores.</span></span>
                  <Switch checked={vi.anunciado_portaria} onCheckedChange={(c) => setVi({ ...vi, anunciado_portaria: c })} />
                </label>
                <section className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                  <p className="text-sm font-semibold sm:col-span-2">Vigência da autorização <span className="font-normal text-muted-foreground">(opcional — sem data final é recorrente)</span></p>
                  <div><Label htmlFor="pd-ini">Data inicial</Label><CampoData id="pd-ini" inicio={new Date().getFullYear()} value={vi.acesso_inicio} onChange={(x) => setVi({ ...vi, acesso_inicio: x })} /></div>
                  <div><Label htmlFor="pd-fim">Data final</Label><CampoData id="pd-fim" inicio={new Date().getFullYear()} value={vi.acesso_fim} onChange={(x) => setVi({ ...vi, acesso_fim: x })} /></div>
                  {periodoInvalido && <p className="text-xs text-destructive sm:col-span-2">A data final deve ser depois da inicial.</p>}
                </section>
                <section className={cn("rounded-lg border", vi.anunciado_portaria && "opacity-60")}>
                  <div className="flex items-center justify-between gap-2 border-b p-3">
                    <span><span className="block text-sm font-semibold">Dias e horários da semana</span><span className="text-xs text-muted-foreground">Sincronizados com os equipamentos de entrada e saída.</span></span>
                    <Button type="button" size="sm" variant="outline" disabled={vi.anunciado_portaria || !vi.acesso_agenda.seg.ativo} onClick={() => setVi({ ...vi, acesso_agenda: copiarParaUteis(vi.acesso_agenda) })}><Copy className="mr-1 size-3.5" /> Copiar segunda p/ seg–sex</Button>
                  </div>
                  {DIAS_SEMANA.map((dia) => {
                    const f = vi.acesso_agenda[dia.k];
                    return (
                      <div key={dia.k} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b p-2 px-3 last:border-0">
                        <label className="flex items-center gap-2 text-sm"><Switch disabled={vi.anunciado_portaria} checked={f.ativo} onCheckedChange={(c) => setDia(dia.k, { ativo: c, entrada: f.entrada || "08:00", saida: f.saida || "17:00" })} />{dia.l}</label>
                        <Input aria-label={`Entrada ${dia.l}`} type="time" className="w-28" disabled={vi.anunciado_portaria || !f.ativo} value={f.entrada} onChange={(e) => setDia(dia.k, { entrada: e.target.value })} />
                        <Input aria-label={`Saída ${dia.l}`} type="time" className="w-28" disabled={vi.anunciado_portaria || !f.ativo} value={f.saida} onChange={(e) => setDia(dia.k, { saida: e.target.value })} />
                      </div>
                    );
                  })}
                </section>
                {erros.map((x) => <p key={x} className="text-xs text-destructive">{x}</p>)}
                <div className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", facial ? "border-primary bg-primary/10" : "bg-muted")}>
                  <ScanFace className="mt-0.5 size-4 shrink-0" />
                  {facial ? "A facial será enviada aos leitores e liberada somente nos dias e horários marcados." : "A facial não será enviada aos leitores: entrada somente com anúncio da portaria."}
                </div>
              </TabsContent>
            )}

            <TabsContent value="prefs" className="mt-0 space-y-4">
              <section className="rounded-lg border">
                <h3 className="border-b p-3 text-sm font-semibold">Preferências</h3>
                {prefsPapel.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhuma preferência cadastrada.</p> : prefsPapel.map((p) => (
                  <label key={p.chave} className="flex items-center justify-between gap-3 border-b p-3 text-sm last:border-0">
                    {p.descricao}
                    <Switch checked={prefsAtuais[p.chave] ?? p.padrao} onCheckedChange={(c) => setPrefs({ ...prefsAtuais, [p.chave]: c })} />
                  </label>
                ))}
                <p className="p-3 pt-0 text-xs italic text-muted-foreground">Algumas dependem de contratação ou integração da administração.</p>
              </section>
              <section className="rounded-lg border p-3">
                <Label className="mb-1.5 flex items-center gap-1 text-sm font-semibold"><Accessibility className="size-4" /> Acessibilidade</Label>
                <p className="mb-2 text-xs text-muted-foreground">Caso tenha necessidades especiais, selecione a opção.</p>
                <SearchSelect value={d.acessibilidade} allowClear={false} options={ACESSIBILIDADE} onChange={(x) => setD({ ...d, acessibilidade: x })} />
              </section>
            </TabsContent>

            {gestor && (
              <TabsContent value="gestao" className="mt-0 space-y-4">
                <section className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-semibold">Status de conexão</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {STATUS_CONEXAO.map((x) => (
                      <button key={x.value} type="button" onClick={() => setVi({ ...vi, status_conexao: x.value })}
                        className={cn("rounded-md border p-3 text-left text-sm transition", vi.status_conexao === x.value ? (x.value === "ativo" ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10") : "hover:bg-muted")}>
                        <span className="flex items-center gap-1 font-medium">{x.value !== "ativo" && <Ban className="size-3.5" />}{x.label}</span>
                        <span className="text-xs text-muted-foreground">{x.ajuda}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <div><Label className="mb-1.5 block">Função no condomínio (corpo diretivo)</Label><SearchSelect value={funcaoPadrao(vi.papel, vi.funcao_condominio)} allowClear={false} options={funcoesDoPapel(vi.papel)} onChange={(x) => setVi({ ...vi, funcao_condominio: x })} /></div>
                {podeDelegarSindico(vi.papel) && <section className="space-y-3 rounded-lg border p-3">
                  <label className="flex items-center justify-between gap-3">
                    <span><span className="block text-sm font-medium">Permissão de síndico</span><span className="text-xs text-muted-foreground">Na ausência do síndico. Sem data, vale por tempo indeterminado.</span></span>
                    <Switch checked={vi.sindico_delegado} onCheckedChange={(c) => setVi({ ...vi, sindico_delegado: c })} />
                  </label>
                  {vi.sindico_delegado && <div className="max-w-xs"><Label htmlFor="pd-sind">Válida até</Label><CampoData id="pd-sind" inicio={new Date().getFullYear()} value={vi.sindico_ate} onChange={(x) => setVi({ ...vi, sindico_ate: x })} /></div>}
                </section>}
              </TabsContent>
            )}
          </div>
        </Tabs>
        <div className="space-y-3 border-t pt-3">
          {aceitoEm ? (
            <p className="text-xs text-muted-foreground">Regimento interno aceito em {isoParaBr(aceitoEm.slice(0, 10))}.</p>
          ) : precisaAceite && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={aceite} onCheckedChange={(c) => setAceite(c === true)} className="mt-0.5" />
              <span>Li e concordo com o <strong>Regimento Interno</strong> do condomínio. <span className="block text-xs text-muted-foreground">Obrigatório para salvar o cadastro principal da unidade.</span></span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={salvando || !valido} onClick={salvar}>{salvando && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
