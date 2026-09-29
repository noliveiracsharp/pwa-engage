import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { digitsOnly, isCompletePhone, isValidCpfCnpj } from "@/lib/input-masks";
import type { Row } from "@/lib/row";

const TEXT_KEYS = [
  "razao_social", "nome_fantasia", "documento", "inscricao_estadual", "telefone", "telefone2", "email",
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "observacoes",
  "data_inicio_atividade", "situacao_cadastral", "motivo_situacao_cadastral", "porte", "natureza_juridica",
  "cnae_principal_codigo", "cnae_principal_descricao", "capital_social",
] as const;
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
  f.tipo_pessoa = r?.["tipo_pessoa"] === "Jurídica" ? "Jurídica" : "Física";
  f.status = r ? r["status"] !== false : true;
  f.opcao_pelo_simples = r?.["opcao_pelo_simples"] === true;
  f.opcao_pelo_mei = r?.["opcao_pelo_mei"] === true;
  f.cnaes_secundarios = arr<Cnae>(r?.["cnaes_secundarios"]);
  f.qsa = arr<Socio>(r?.["qsa"]);
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
};

export function ParceiroSheet({ open, onOpenChange, record, readOnly, saving, onSave }: Props) {
  const [f, setF] = useState<Form>(() => toForm(record));
  const [tab, setTab] = useState("gerais");
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  useEffect(() => { if (open) { setF(toForm(record)); setTab("gerais"); } }, [open, record]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const pf = f.tipo_pessoa === "Física";

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

  async function lookupCnpj(value: string) {
    const cnpj = digitsOnly(value);
    if (cnpj.length !== 14) { toast.error("Informe os 14 dígitos do CNPJ."); return; }
    if (!isValidCpfCnpj(cnpj)) { toast.error("CNPJ inválido."); return; }
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) { toast.error("CNPJ não encontrado na Receita Federal."); return; }
      const d = await res.json();
      setF((p) => ({
        ...p,
        razao_social: d.razao_social || p.razao_social,
        nome_fantasia: d.nome_fantasia || p.nome_fantasia,
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
    if (!isCompletePhone(f.telefone)) { toast.error("Telefone principal incompleto."); return; }
    if (!isCompletePhone(f.telefone2)) { toast.error("Telefone secundário incompleto."); return; }
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
    };
    for (const k of TEXT_KEYS) values[k] = f[k].trim() || null;
    values["documento"] = doc || null;
    values["cep"] = digitsOnly(f.cep) || null;
    values["uf"] = f.uf.trim().toUpperCase() || null;
    values["capital_social"] = f.capital_social.trim() === "" ? null : Number(f.capital_social);
    if (pf) {
      for (const k of ["nome_fantasia", "inscricao_estadual", "data_inicio_atividade", "situacao_cadastral", "motivo_situacao_cadastral",
        "porte", "natureza_juridica", "capital_social", "cnae_principal_codigo", "cnae_principal_descricao"]) values[k] = null;
      values["opcao_pelo_simples"] = false;
      values["opcao_pelo_mei"] = false;
      values["cnaes_secundarios"] = [];
      values["qsa"] = [];
    }
    onSave(values);
  }

  const field = (k: TextKey, label: string, cls = "", extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <div className={cls}>
      <Label htmlFor={`p-${k}`} className="mb-1.5 block text-sm font-medium">{label}</Label>
      <Input id={`p-${k}`} value={f[k]} disabled={readOnly} onChange={(e) => set(k, e.target.value)} {...extra} />
    </div>
  );
  const section = (t: string) => <h3 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">{t}</h3>;
  const ativa = f.situacao_cadastral.toUpperCase() === "ATIVA";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>{record ? "Editar parceiro" : "Novo parceiro"}</SheetTitle>
          <SheetDescription>Clientes e fornecedores usados no financeiro e faturamento.</SheetDescription>
        </SheetHeader>
        <Tabs value={pf ? "gerais" : tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mb-4 w-fit">
            <TabsTrigger value="gerais">Dados Gerais</TabsTrigger>
            {!pf && <TabsTrigger value="fiscal">Fiscal e Atividades</TabsTrigger>}
            {!pf && <TabsTrigger value="qsa">Quadro Societário</TabsTrigger>}
          </TabsList>
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
                    {(["Física", "Jurídica"] as const).map((t) => (
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
                  </div>
                  {!pf && field("inscricao_estadual", "Inscrição Estadual")}
                  {field("razao_social", pf ? "Nome Completo" : "Razão Social", "sm:col-span-2")}
                  {!pf && field("nome_fantasia", "Nome Fantasia", "sm:col-span-2")}
                </div>
              </div>

              <div>
                {section("Contatos")}
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  {field("email", "E-mail", "sm:col-span-2", { type: "email" })}
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 block text-sm font-medium">Telefone Principal</Label>
                    <PhoneInput value={f.telefone} onChange={(v) => set("telefone", v)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 block text-sm font-medium">Telefone Secundário</Label>
                    <PhoneInput value={f.telefone2} onChange={(v) => set("telefone2", v)} />
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
                </div>
              </div>

              <div>
                <Label htmlFor="p-obs" className="mb-1.5 block text-sm font-medium">Observações</Label>
                <Textarea id="p-obs" rows={4} value={f.observacoes} disabled={readOnly} onChange={(e) => set("observacoes", e.target.value)} />
              </div>
            </TabsContent>

            {!pf && (
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

            {!pf && (
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
