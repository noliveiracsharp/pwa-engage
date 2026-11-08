import { useEffect, useMemo, useState } from "react";
import { fetchCnpj } from "@/lib/cnpj";
import { nomeProprio } from "@/lib/nome-proprio";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CarteiraCondominios } from "./CarteiraCondominios";
import { DocumentosButton } from "@/components/documentos/DocumentosPainel";
import { ContatosPainel } from "@/components/contatos/ContatosButton";
import { rowId as docRowId } from "@/lib/crud";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { digitsOnly, formatCpfCnpj, isCompletePhone, isValidCpfCnpj } from "@/lib/input-masks";
import { descendantIds } from "@/lib/hierarchy";
import { ClassificacaoField, useClassificacoes } from "@/components/parceiros/ClassificacaoField";
import { ehCondominio } from "@/components/empresas/GestaoCondominial";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { coordNum, geocodificar, gpsNavegador } from "@/lib/geocodificacao";
import { MapPin, LocateFixed } from "lucide-react";
import { rowId } from "@/lib/crud";
import type { SecaoPerms } from "@/lib/secoes-permissao";
import type { Row } from "@/lib/row";

export const PARENT_KEY = "parceiro_pai_id";

export type TipoHierarquia = "independente" | "matriz" | "filial" | "cliente";
export const TIPOS_HIERARQUIA: { value: TipoHierarquia; label: string; ajuda: string }[] = [
  { value: "independente", label: "Independente", ajuda: "Cadastro avulso, sem vínculo." },
  { value: "matriz", label: "Matriz / Administradora", ajuda: "Gestora que tem filiais ou clientes vinculados." },
  { value: "filial", label: "Filial", ajuda: "Unidade com CNPJ próprio de uma matriz." },
  { value: "cliente", label: "Cliente vinculado", ajuda: "Ex.: condomínio da administradora ou cliente da portaria." },
];
export const tipoHierarquiaLabel = (v: unknown) =>
  TIPOS_HIERARQUIA.find((t) => t.value === v)?.label ?? "Independente";

/** Rótulo do parceiro na árvore de matriz/filial. */
export function parceiroLabel(r: Row): string {
  const nome = String(r["razao_social"] ?? r["nome_fantasia"] ?? "—");
  const doc = formatCpfCnpj(String(r["documento"] ?? ""));
  return doc ? `${nome} (${doc})` : nome;
}

/** Ordena os parceiros em árvore (matriz seguida das filiais). */
export function parceiroTree(rows: Row[]): { row: Row; depth: number }[] {
  const ids = new Set(rows.map((r) => String(rowId(r))));
  const byParent = new Map<string, Row[]>();
  for (const r of rows) {
    const p = r[PARENT_KEY];
    const key = p != null && ids.has(String(p)) ? String(p) : "";
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  const out: { row: Row; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (key: string, depth: number) => {
    for (const r of [...(byParent.get(key) ?? [])].sort((a, b) => parceiroLabel(a).localeCompare(parceiroLabel(b), "pt-BR"))) {
      const id = String(rowId(r));
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ row: r, depth });
      walk(id, depth + 1);
    }
  };
  walk("", 0);
  for (const r of rows) if (!seen.has(String(rowId(r)))) out.push({ row: r, depth: 0 });
  return out;
}


const TEXT_KEYS = [
  "razao_social", "nome_fantasia", "documento", "inscricao_estadual", "telefone", "telefone2", "email",
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "observacoes",
  "data_inicio_atividade", "situacao_cadastral", "motivo_situacao_cadastral", "porte", "natureza_juridica",
  "cnae_principal_codigo", "cnae_principal_descricao", "capital_social", "cobranca_canais", "oferta_canais",
  "classificacao_id", "latitude", "longitude",
  "logo", "logo_escuro", "cor_primaria_claro", "cor_primaria_escuro",
] as const;
/** Marca própria do condomínio (White Label); colunas criadas pelo script de marca. */
const WL_KEYS = ["logo", "logo_escuro", "cor_primaria_claro", "cor_primaria_escuro"] as const;
type TextKey = (typeof TEXT_KEYS)[number];

type Cnae = { codigo: string; descricao: string };
type Socio = { nome: string; qualificacao: string; pais: string; faixa_etaria?: string };

type Form = Record<TextKey, string> & {
  is_cliente: boolean;
  is_fornecedor: boolean;
  tipo_pessoa: "Física" | "Jurídica";
  status: boolean;
  opcao_pelo_simples: boolean;
  opcao_pelo_mei: boolean;
  cnaes_secundarios: Cnae[];
  qsa: Socio[];
  parceiro_pai_id: string;
  tipo_hierarquia: TipoHierarquia;
};

function arr<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function toForm(r: Row | null): Form {
  const f = {} as Form;
  for (const k of TEXT_KEYS) f[k] = r?.[k] == null ? "" : String(r[k]);
  f.data_inicio_atividade = f.data_inicio_atividade.slice(0, 10);
  f.is_cliente = r ? r["is_cliente"] === true : true;
  f.is_fornecedor = r?.["is_fornecedor"] === true;
  f.tipo_pessoa = r?.["tipo_pessoa"] === "Física" ? "Física" : "Jurídica";
  f.status = r ? r["status"] !== false : true;
  f.opcao_pelo_simples = r?.["opcao_pelo_simples"] === true;
  f.opcao_pelo_mei = r?.["opcao_pelo_mei"] === true;
  f.cnaes_secundarios = arr<Cnae>(r?.["cnaes_secundarios"]);
  f.qsa = arr<Socio>(r?.["qsa"]);
  f.parceiro_pai_id = r?.[PARENT_KEY] == null ? "" : String(r[PARENT_KEY]);
  const th = r?.["tipo_hierarquia"];
  f.tipo_hierarquia = TIPOS_HIERARQUIA.some((t) => t.value === th) ? (th as TipoHierarquia) : f.parceiro_pai_id ? "filial" : "independente";
  return f;
}

const formatCep = (v: string) => digitsOnly(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
const brl = (v: string) => (v === "" || isNaN(Number(v)) ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const phone55 = (v: unknown) => { const d = digitsOnly(String(v ?? "")); return d.length >= 10 ? `+55${d}` : ""; };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: Row | null;
  readOnly: boolean;
  saving: boolean;
  onSave: (values: Row) => void;
  parceiros?: Row[];
  /** Permissão por seção (Funções filhas de /parceiros). Ausente = segue a tela. */
  secoes?: Record<string, SecaoPerms | undefined>;
  /** Valores pré-preenchidos para um cadastro novo (ex.: nome/telefone vindos do WhatsApp). */
  inicial?: Row | undefined;
};

export function ParceiroSheet({ open, onOpenChange, record, readOnly: roTela, saving, onSave, parceiros = [], secoes, inicial }: Props) {
  const ver = (k: string) => !secoes || Boolean(secoes[k]?.canRead);
  const readOnly = roTela || Boolean(record && secoes && !secoes["dados"]?.canUpdate);
  const [f, setF] = useState<Form>(() => toForm(record));
  const [tab, setTab] = useState("gerais");
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const base = toForm(record);
    if (!record && inicial) for (const k of ["razao_social", "telefone", "email"] as const) {
      const v = inicial[k];
      if (v != null && String(v).trim()) (base as Record<string, unknown>)[k] = String(v);
    }
    setF(base); setTab("gerais");
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const pf = f.tipo_pessoa === "Física";
  const { data: classificacoes = [] } = useClassificacoes();
  const condo = ehCondominio(classificacoes, f.classificacao_id || undefined);

  const paiOptions = useMemo(() => {
    const blocked = record ? descendantIds(parceiros, PARENT_KEY, String(rowId(record))) : new Set<string>();
    return parceiroTree(parceiros).filter(({ row }) => !blocked.has(String(rowId(row))));
  }, [parceiros, record]);

  const duplicado = useMemo(() => {
    const d = digitsOnly(f.documento);
    if (d.length < 11) return undefined;
    const meuId = record ? String(rowId(record)) : "";
    return parceiros.find((p) => String(rowId(p)) !== meuId && digitsOnly(String(p["documento"] ?? "")) === d);
  }, [f.documento, parceiros, record]);

  async function lookupCep(value: string) {
    const cep = digitsOnly(value);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (d.erro) { toast.error("CEP não encontrado."); return; }
      setF((p) => ({
        ...p,
        endereco: d.logradouro || p.endereco,
        bairro: d.bairro || p.bairro,
        cidade: d.localidade || p.cidade,
        uf: d.uf || p.uf,
        complemento: p.complemento || d.complemento || "",
      }));
    } catch {
      toast.error("Não foi possível consultar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  const [geoLoading, setGeoLoading] = useState(false);
  async function buscarCoordenadas(gps = false) {
    setGeoLoading(true);
    try {
      const c = gps ? await gpsNavegador() : await geocodificar({ endereco: f.endereco, numero: f.numero, bairro: f.bairro, cidade: f.cidade, uf: f.uf, cep: f.cep });
      if (!c) { toast.error(gps ? "Não foi possível obter a localização do aparelho." : "Não encontramos coordenadas para este endereço."); return; }
      setF((p) => ({ ...p, latitude: String(c.latitude), longitude: String(c.longitude) }));
      toast.success("Coordenadas preenchidas.");
    } finally { setGeoLoading(false); }
  }

  async function lookupCnpj(value: string) {
    const cnpj = digitsOnly(value);
    if (cnpj.length !== 14) { toast.error("Informe os 14 dígitos do CNPJ."); return; }
    if (!isValidCpfCnpj(cnpj)) { toast.error("CNPJ inválido."); return; }
    setCnpjLoading(true);
    try {
      const res = await fetchCnpj(cnpj);
      if (!res.ok) { toast.error("CNPJ não encontrado na Receita Federal."); return; }
      const d = await res.json();
      setF((p) => ({
        ...p,
        razao_social: d.razao_social ? nomeProprio(d.razao_social) : p.razao_social,
        nome_fantasia: d.nome_fantasia ? nomeProprio(d.nome_fantasia) : p.nome_fantasia,
        telefone: phone55(d.ddd_telefone_1) || p.telefone,
        telefone2: phone55(d.ddd_telefone_2) || p.telefone2,
        email: d.email ? String(d.email).toLowerCase() : p.email,
        cep: digitsOnly(String(d.cep ?? "")) || p.cep,
        endereco: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ").trim() || p.endereco,
        numero: d.numero || p.numero,
        complemento: d.complemento || p.complemento,
        bairro: d.bairro || p.bairro,
        cidade: d.municipio || p.cidade,
        uf: d.uf || p.uf,
        data_inicio_atividade: d.data_inicio_atividade ? String(d.data_inicio_atividade).slice(0, 10) : p.data_inicio_atividade,
        situacao_cadastral: d.descricao_situacao_cadastral || "",
        motivo_situacao_cadastral: d.descricao_motivo_situacao_cadastral || "",
        porte: d.porte || d.descricao_porte || "",
        natureza_juridica: d.natureza_juridica || "",
        capital_social: d.capital_social != null ? String(d.capital_social) : "",
        opcao_pelo_simples: d.opcao_pelo_simples === true,
        opcao_pelo_mei: d.opcao_pelo_mei === true,
        cnae_principal_codigo: d.cnae_fiscal != null ? String(d.cnae_fiscal) : "",
        cnae_principal_descricao: d.cnae_fiscal_descricao || "",
        cnaes_secundarios: (Array.isArray(d.cnaes_secundarios) ? d.cnaes_secundarios : [])
          .filter((i: { codigo?: number }) => i.codigo)
          .map((i: { codigo: number; descricao: string }) => ({ codigo: String(i.codigo), descricao: i.descricao ?? "" })),
        qsa: (Array.isArray(d.qsa) ? d.qsa : []).map((i: Record<string, unknown>) => ({
          nome: String(i["nome_socio"] ?? ""),
          qualificacao: String(i["qualificacao_socio"] ?? ""),
          pais: String(i["pais"] ?? ""),
          faixa_etaria: String(i["faixa_etaria"] ?? ""),
        })),
      }));
      const situacao = String(d.descricao_situacao_cadastral ?? "");
      if (situacao && situacao.toUpperCase() !== "ATIVA") toast.warning(`Situação cadastral: ${situacao}.`);
      else toast.success("Dados encontrados na Receita Federal.");
    } catch {
      toast.error("Não foi possível consultar o CNPJ.");
    } finally {
      setCnpjLoading(false);
    }
  }

  function submit(): void {
    if (!f.razao_social.trim()) { toast.error(pf ? "Informe o nome completo." : "Informe a razão social."); return; }
    if (!f.is_cliente && !f.is_fornecedor) { toast.error("Marque se é Cliente e/ou Fornecedor."); return; }
    const doc = digitsOnly(f.documento);
    if (doc && (doc.length !== (pf ? 11 : 14) || !isValidCpfCnpj(doc)))
      { toast.error(pf ? "CPF inválido." : "CNPJ inválido."); return; }
    const precisaPai = f.tipo_hierarquia === "filial" || f.tipo_hierarquia === "cliente";
    if (precisaPai && !f.parceiro_pai_id) { toast.error("Escolha a matriz/administradora responsável."); return; }
    const dup = duplicado;
    if (dup) { toast.error(`Este ${pf ? "CPF" : "CNPJ"} já está cadastrado para: ${String(dup["razao_social"] ?? "—")}.`); return; }
    // Cadastro existente: telefones são geridos pela lista de contatos (campos legados não bloqueiam).
    if (!record && !isCompletePhone(f.telefone)) { toast.error("Telefone principal incompleto."); return; }
    if (!record && !isCompletePhone(f.telefone2)) { toast.error("Telefone secundário incompleto."); return; }
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) { toast.error("E-mail inválido."); return; }
    const values: Row = {
      is_cliente: f.is_cliente,
      is_fornecedor: f.is_fornecedor,
      tipo_pessoa: f.tipo_pessoa,
      status: f.status,
      opcao_pelo_simples: f.opcao_pelo_simples,
      opcao_pelo_mei: f.opcao_pelo_mei,
      cnaes_secundarios: f.cnaes_secundarios,
      qsa: f.qsa,
      [PARENT_KEY]: precisaPai ? f.parceiro_pai_id : null,
      tipo_hierarquia: f.tipo_hierarquia,
    };
    for (const k of TEXT_KEYS) values[k] = f[k].trim() || null;
    // marca só para condomínios; sem valores não envia (tenants sem o script continuam salvando)
    if (!condo || WL_KEYS.every((k) => !values[k] && !record?.[k])) for (const k of WL_KEYS) delete values[k];
    // com cadastro existente, telefones/e-mail vêm da lista de contatos (sincronizados por ela)
    if (record) for (const k of ["telefone", "telefone2", "email"]) delete values[k];
    // só grava a preferência de cobrança quando escolhida (coluna criada pelo script da régua)
    if (!values["cobranca_canais"]) delete values["cobranca_canais"];
    if (!values["oferta_canais"] && !record?.["oferta_canais"]) delete values["oferta_canais"];
    values["documento"] = doc || null;
    values["cep"] = digitsOnly(f.cep) || null;
    values["uf"] = f.uf.trim().toUpperCase() || null;
    values["classificacao_id"] = f.classificacao_id || null;
    values["latitude"] = coordNum(f.latitude);
    values["longitude"] = coordNum(f.longitude);
    if (!record) { for (const k of ["classificacao_id", "latitude", "longitude"]) if (values[k] == null) delete values[k]; }
    values["capital_social"] = f.capital_social.trim() === "" ? null : Number(f.capital_social);
    if (pf) {
      for (const k of ["nome_fantasia", "inscricao_estadual", "data_inicio_atividade", "situacao_cadastral", "motivo_situacao_cadastral",
        "porte", "natureza_juridica", "capital_social", "cnae_principal_codigo", "cnae_principal_descricao"]) values[k] = null;
      values["opcao_pelo_simples"] = false;
      values["opcao_pelo_mei"] = false;
      values["cnaes_secundarios"] = [];
      values["qsa"] = [];
    }
    for (const k of ["razao_social", "nome_fantasia"]) if (typeof values[k] === "string") values[k] = nomeProprio(values[k]);
    onSave(values);
  }

  const field = (k: TextKey, label: string, cls = "", extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <div className={cls}>
      <Label htmlFor={`p-${k}`} className="mb-1.5 block text-sm font-medium">{label}</Label>
      <Input id={`p-${k}`} value={f[k]} disabled={readOnly} onChange={(e) => set(k, e.target.value)}
        onBlur={k === "razao_social" || k === "nome_fantasia" ? () => set(k, nomeProprio(f[k])) : undefined} {...extra} />
    </div>
  );
  const section = (t: string) => <h3 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">{t}</h3>;
  const ativa = f.situacao_cadastral.toUpperCase() === "ATIVA";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="pr-8">{record ? "Editar parceiro" : "Novo parceiro"}</SheetTitle>
          <SheetDescription>Clientes e fornecedores usados no financeiro e faturamento.</SheetDescription>
        </SheetHeader>
        <Tabs value={pf ? "gerais" : tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="mx-6 mb-4 flex flex-wrap items-center gap-2">
            <TabsList className="h-auto w-fit flex-wrap">
              <TabsTrigger value="gerais">Dados Gerais</TabsTrigger>
              {!pf && ver("fiscal") && <TabsTrigger value="fiscal">Fiscal e Atividades</TabsTrigger>}
              {!pf && ver("qsa") && <TabsTrigger value="qsa">Quadro Societário</TabsTrigger>}
              {!pf && record && !condo && <TabsTrigger value="carteira">Condomínios</TabsTrigger>}
              {!pf && condo && <TabsTrigger value="wl">White Label</TabsTrigger>}
            </TabsList>
            {record && ver("documentos") && (
              <div className="ml-auto">
                <DocumentosButton entidadeTipo="parceiro" entidadeId={String(docRowId(record) ?? "")} entidadeNome={String(record["razao_social"] ?? record["nome"] ?? record["nome_fantasia"] ?? "")} registro={record} />
              </div>
            )}
          </div>
          <fieldset disabled={readOnly} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <TabsContent value="gerais" className="mt-0 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {([["is_cliente", "É Cliente?"], ["is_fornecedor", "É Fornecedor?"]] as const).map(([k, l]) => (
                  <label key={k} className="border-primary/30 bg-primary/5 flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3">
                    <span className="font-medium">{l}</span>
                    <Switch checked={f[k]} disabled={readOnly} onCheckedChange={(v) => set(k, v)} />
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <Label className="mb-2 block text-sm font-medium">Tipo de Pessoa</Label>
                  <RadioGroup value={f.tipo_pessoa} onValueChange={(v) => { set("tipo_pessoa", v as Form["tipo_pessoa"]); set("documento", ""); }} className="flex gap-6">
                    {(["Jurídica", "Física"] as const).map((t) => (
                      <label key={t} className="flex cursor-pointer items-center gap-2">
                        <RadioGroupItem value={t} disabled={readOnly} /> {t}
                      </label>
                    ))}
                  </RadioGroup>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{f.status ? "Ativo" : "Inativo"}</span>
                  <Switch checked={f.status} disabled={readOnly} onCheckedChange={(v) => set("status", v)} />
                </div>
              </div>

              {!pf && f.situacao_cadastral && (
                <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm ${ativa ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
                  <span className="font-medium">Situação na Receita Federal:</span>
                  <Badge variant={ativa ? "default" : "destructive"}>{f.situacao_cadastral.toUpperCase()}</Badge>
                  {!ativa && f.motivo_situacao_cadastral && !/sem motivo/i.test(f.motivo_situacao_cadastral) && (
                    <span className="text-muted-foreground">Motivo: {f.motivo_situacao_cadastral}</span>
                  )}
                  {!ativa && f.status && !readOnly && (
                    <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => set("status", false)}>Marcar como Inativo</Button>
                  )}
                </div>
              )}


              <div>
                {section("Identificação")}
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="p-doc" className="mb-1.5 block text-sm font-medium">{pf ? "CPF" : "CNPJ"}</Label>
                    <div className="flex gap-2">
                      <DocumentInput id="p-doc" value={f.documento} placeholder={pf ? "000.000.000-00" : "00.000.000/0000-00"}
                        onChange={(v) => {
                          const d = v.slice(0, pf ? 11 : 14);
                          set("documento", d);
                          if (!pf && d.length === 14 && !readOnly) void lookupCnpj(d);
                        }} />
                      {!pf && (
                        <Button type="button" variant="outline" size="icon" disabled={readOnly || cnpjLoading}
                          title="Buscar dados na Receita Federal" onClick={() => void lookupCnpj(f.documento)}>
                          {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    {duplicado && (
                      <p className="text-destructive mt-1.5 text-xs font-medium">
                        Já cadastrado para: {String(duplicado["razao_social"] ?? "—")}
                      </p>
                    )}
                  </div>
                  {!pf && field("inscricao_estadual", "Inscrição Estadual")}
                  {field("razao_social", pf ? "Nome Completo" : "Razão Social", "sm:col-span-2")}
                  {!pf && field("nome_fantasia", "Nome Fantasia", "sm:col-span-2")}
                  <div className="sm:col-span-2">
                    <ClassificacaoField value={f.classificacao_id} disabled={readOnly} onChange={(v) => set("classificacao_id", v)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 block text-sm font-medium">Tipo na estrutura</Label>
                    <Select value={f.tipo_hierarquia} disabled={readOnly}
                      onValueChange={(v) => setF((p) => ({ ...p, tipo_hierarquia: v as TipoHierarquia, parceiro_pai_id: v === "filial" || v === "cliente" ? p.parceiro_pai_id : "" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_HIERARQUIA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground mt-1.5 text-xs">{TIPOS_HIERARQUIA.find((t) => t.value === f.tipo_hierarquia)?.ajuda}</p>
                  </div>
                  {(f.tipo_hierarquia === "filial" || f.tipo_hierarquia === "cliente") && (
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5 block text-sm font-medium">Matriz / Administradora responsável</Label>
                      <Select value={f.parceiro_pai_id || "none"} disabled={readOnly}
                        onValueChange={(v) => set("parceiro_pai_id", v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent sort={false}>
                          <SelectItem value="none">Selecione…</SelectItem>
                          {paiOptions.map(({ row, depth }) => (
                            <SelectItem key={String(rowId(row))} value={String(rowId(row))}>
                              {`${"\u00A0\u00A0".repeat(depth)}${depth ? "↳ " : ""}${parceiroLabel(row)}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <div>
                {section("Contatos")}
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  {record ? (!ver("contatos") ? null :
                    <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3">
                      <p className="mb-2 text-xs text-muted-foreground">Telefones e e-mails usados nos envios. Cobranças usam "Financeiro", ofertas "Comercial" e notas "Fiscal" (ou o Principal ⭐).</p>
                      <ContatosPainel entidade="parceiro" entidadeId={String(docRowId(record) ?? "")} />
                    </div>
                  ) : (<>
                  {field("email", "E-mail", "sm:col-span-2", { type: "email" })}
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 block text-sm font-medium">Telefone Principal</Label>
                    <PhoneInput value={f.telefone} onChange={(v) => set("telefone", v)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 block text-sm font-medium">Telefone Secundário</Label>
                    <PhoneInput value={f.telefone2} onChange={(v) => set("telefone2", v)} />
                  </div>
                  <p className="sm:col-span-2 text-xs text-muted-foreground">Depois de salvar, você poderá cadastrar vários contatos com finalidade.</p>
                  </>)}
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 block text-sm font-medium">Receber cobranças automáticas por</Label>
                    <Select value={f.cobranca_canais || "padrao"} onValueChange={(v) => set("cobranca_canais", v === "padrao" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padrao">Padrão da empresa</SelectItem>
                        <SelectItem value="whatsapp">Somente WhatsApp</SelectItem>
                        <SelectItem value="email">Somente e-mail</SelectItem>
                        <SelectItem value="ambos">WhatsApp e e-mail</SelectItem>
                        <SelectItem value="nenhum">Não enviar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 block text-sm font-medium">Receber acompanhamento de Ofertas por</Label>
                    <Select value={f.oferta_canais || "padrao"} onValueChange={v => set("oferta_canais", v === "padrao" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padrao">Padrão da empresa</SelectItem>
                        <SelectItem value="email">Somente e-mail</SelectItem>
                        <SelectItem value="whatsapp">Somente WhatsApp</SelectItem>
                        <SelectItem value="ambos">WhatsApp e e-mail</SelectItem>
                        <SelectItem value="nenhum">Não enviar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                {section("Endereço")}
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Label htmlFor="p-cep" className="mb-1.5 block text-sm font-medium">CEP</Label>
                    <div className="relative">
                      <Input id="p-cep" inputMode="numeric" placeholder="00000-000" value={formatCep(f.cep)}
                        onChange={(e) => { const d = digitsOnly(e.target.value).slice(0, 8); set("cep", d); if (d.length === 8) void lookupCep(d); }} />
                      {cepLoading && <Loader2 className="text-muted-foreground absolute top-2.5 right-3 h-4 w-4 animate-spin" />}
                    </div>
                  </div>
                  {field("endereco", "Logradouro", "sm:col-span-4")}
                  {field("numero", "Número", "sm:col-span-2")}
                  {field("complemento", "Complemento", "sm:col-span-4")}
                  {field("bairro", "Bairro", "sm:col-span-2")}
                  {field("cidade", "Cidade", "sm:col-span-3")}
                  {field("uf", "UF", "sm:col-span-1", { maxLength: 2, className: "uppercase" })}
                  {field("latitude", "Latitude", "sm:col-span-2", { inputMode: "decimal", placeholder: "-23.5505200" })}
                  {field("longitude", "Longitude", "sm:col-span-2", { inputMode: "decimal", placeholder: "-46.6333080" })}
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Button type="button" variant="outline" className="flex-1" disabled={readOnly || geoLoading} onClick={() => void buscarCoordenadas()} title="Obter coordenadas pelo endereço/CEP">
                      {geoLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MapPin className="mr-1 h-4 w-4" />}Pelo endereço
                    </Button>
                    <Button type="button" variant="outline" size="icon" disabled={readOnly || geoLoading} onClick={() => void buscarCoordenadas(true)} title="Usar a localização do aparelho">
                      <LocateFixed className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="p-obs" className="mb-1.5 block text-sm font-medium">Observações</Label>
                <Textarea id="p-obs" rows={4} value={f.observacoes} disabled={readOnly} onChange={(e) => set("observacoes", e.target.value)} />
              </div>
            </TabsContent>

            {!pf && ver("fiscal") && (
              <TabsContent value="fiscal" className="mt-0 space-y-6">
                <div>
                  {section("Situação Cadastral")}
                  <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 block text-sm font-medium">Situação</Label>
                      {f.situacao_cadastral
                        ? <Badge variant={ativa ? "default" : "destructive"}>{f.situacao_cadastral}</Badge>
                        : <span className="text-muted-foreground text-sm">Não consultado</span>}
                    </div>
                    {field("data_inicio_atividade", "Início da Atividade", "", { type: "date" })}
                    {(f.motivo_situacao_cadastral && !/sem motivo/i.test(f.motivo_situacao_cadastral)) &&
                      field("motivo_situacao_cadastral", "Motivo da Situação", "sm:col-span-2")}
                  </div>
                </div>

                <div>
                  {section("Porte e Enquadramento")}
                  <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                    {field("porte", "Porte da Empresa")}
                    <div>
                      <Label htmlFor="p-capital_social" className="mb-1.5 block text-sm font-medium">Capital Social</Label>
                      <Input id="p-capital_social" type="number" step="0.01" value={f.capital_social} disabled={readOnly}
                        onChange={(e) => set("capital_social", e.target.value)} />
                      {f.capital_social && <p className="text-muted-foreground mt-1 text-xs">{brl(f.capital_social)}</p>}
                    </div>
                    {field("natureza_juridica", "Natureza Jurídica", "sm:col-span-2")}
                    {([["opcao_pelo_simples", "Optante pelo Simples Nacional"], ["opcao_pelo_mei", "Optante pelo MEI"]] as const).map(([k, l]) => (
                      <label key={k} className="flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3">
                        <span className="text-sm font-medium">{l}</span>
                        <Switch checked={f[k]} disabled={readOnly} onCheckedChange={(v) => set(k, v)} />
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  {section("Atividades Econômicas")}
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <div className="text-muted-foreground mb-1 text-xs font-medium">CNAE Principal</div>
                      {f.cnae_principal_codigo
                        ? <div className="text-sm"><span className="font-mono font-semibold">{f.cnae_principal_codigo}</span> — {f.cnae_principal_descricao}</div>
                        : <span className="text-muted-foreground text-sm">Não informado</span>}
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-muted-foreground mb-2 text-xs font-medium">CNAEs Secundários ({f.cnaes_secundarios.length})</div>
                      {f.cnaes_secundarios.length === 0
                        ? <span className="text-muted-foreground text-sm">Nenhum CNAE secundário.</span>
                        : <ul className="divide-y text-sm">
                            {f.cnaes_secundarios.map((c) => (
                              <li key={c.codigo} className="py-1.5"><span className="font-mono font-semibold">{c.codigo}</span> — {c.descricao}</li>
                            ))}
                          </ul>}
                    </div>
                  </div>
                </div>
              </TabsContent>
            )}

            {!pf && ver("qsa") && (
              <TabsContent value="qsa" className="mt-0">
                {f.qsa.length === 0
                  ? <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">Nenhum sócio registrado na consulta.</div>
                  : <div className="grid gap-3">
                      {f.qsa.map((s, i) => (
                        <div key={`${s.nome}-${i}`} className="rounded-lg border p-4">
                          <div className="font-medium">{s.nome || "—"}</div>
                          <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {s.qualificacao && <span>{s.qualificacao}</span>}
                            {s.pais && <span>País: {s.pais}</span>}
                            {s.faixa_etaria && <span>Faixa etária: {s.faixa_etaria}</span>}
                          </div>
                        </div>
                      ))}
                    </div>}
              </TabsContent>
            )}

            {!pf && condo && (
              <TabsContent value="wl" className="mt-0 space-y-4">
                <p className="text-xs text-muted-foreground">Logo e cores exibidos para síndico, moradores e equipe quando entram neste condomínio. Vazio usa a marca da administradora.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="light rounded-lg border border-border bg-background p-3 text-foreground">
                    <p className="mb-2 text-sm font-medium">Logo — modo claro</p>
                    <PhotoUpload value={f.logo} alt="Logo do condomínio" onChange={(url) => set("logo", url)} />
                  </div>
                  <div className="dark rounded-lg border border-border bg-background p-3 text-foreground">
                    <p className="mb-2 text-sm font-medium">Logo — modo escuro (opcional)</p>
                    <PhotoUpload value={f.logo_escuro} alt="Logo do condomínio no modo escuro" onChange={(url) => set("logo_escuro", url)} />
                  </div>
                  {([["cor_primaria_claro", "Cor primária — modo claro"], ["cor_primaria_escuro", "Cor primária — modo escuro"]] as const).map(([k, l]) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={`p-${k}`}>{l}</Label>
                      <div className="flex gap-2">
                        <input type="color" aria-label={l} value={/^#[0-9a-f]{6}$/i.test(f[k]) ? f[k] : "#6d28d9"} disabled={readOnly} onChange={(e) => set(k, e.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background" />
                        <Input id={`p-${k}`} value={f[k]} disabled={readOnly} placeholder="#000000" onChange={(e) => set(k, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}

            {!pf && record && !condo && (
              <TabsContent value="carteira" className="mt-0">
                <CarteiraCondominios parceiroId={String(docRowId(record) ?? "")} />
              </TabsContent>
            )}
          </fieldset>
        </Tabs>
        <div className="bg-background sticky bottom-0 flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={readOnly || saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
