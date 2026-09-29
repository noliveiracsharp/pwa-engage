import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { digitsOnly, isCompletePhone, isValidCpfCnpj } from "@/lib/input-masks";
import type { Row } from "@/lib/row";

const TEXT_KEYS = [
  "razao_social", "nome_fantasia", "documento", "inscricao_estadual", "telefone",
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf",
] as const;

type Form = Record<(typeof TEXT_KEYS)[number], string> & {
  is_cliente: boolean;
  is_fornecedor: boolean;
  tipo_pessoa: "Física" | "Jurídica";
  status: boolean;
};

function toForm(r: Row | null): Form {
  const f = {} as Form;
  for (const k of TEXT_KEYS) f[k] = r?.[k] == null ? "" : String(r[k]);
  f.is_cliente = r ? r["is_cliente"] === true : true;
  f.is_fornecedor = r?.["is_fornecedor"] === true;
  f.tipo_pessoa = r?.["tipo_pessoa"] === "Jurídica" ? "Jurídica" : "Física";
  f.status = r ? r["status"] !== false : true;
  return f;
}

const formatCep = (v: string) => digitsOnly(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

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
  const [cepLoading, setCepLoading] = useState(false);
  useEffect(() => { if (open) setF(toForm(record)); }, [open, record]);

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

  function submit(): void {
    if (!f.razao_social.trim()) { toast.error(pf ? "Informe o nome completo." : "Informe a razão social."); return; }
    if (!f.is_cliente && !f.is_fornecedor) { toast.error("Marque se é Cliente e/ou Fornecedor."); return; }
    const doc = digitsOnly(f.documento);
    if (doc && (doc.length !== (pf ? 11 : 14) || !isValidCpfCnpj(doc)))
      { toast.error(pf ? "CPF inválido." : "CNPJ inválido."); return; }
    if (!isCompletePhone(f.telefone)) { toast.error("Telefone incompleto."); return; }
    const values: Row = {
      is_cliente: f.is_cliente,
      is_fornecedor: f.is_fornecedor,
      tipo_pessoa: f.tipo_pessoa,
      status: f.status,
    };
    for (const k of TEXT_KEYS) values[k] = f[k].trim() || null;
    values["documento"] = doc || null;
    values["cep"] = digitsOnly(f.cep) || null;
    values["uf"] = f.uf.trim().toUpperCase() || null;
    if (pf) { values["nome_fantasia"] = null; values["inscricao_estadual"] = null; }
    onSave(values);
  }

  const field = (k: (typeof TEXT_KEYS)[number], label: string, cls = "", extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <div className={cls}>
      <Label htmlFor={`p-${k}`} className="mb-1.5 block text-sm font-medium">{label}</Label>
      <Input id={`p-${k}`} value={f[k]} disabled={readOnly} onChange={(e) => set(k, e.target.value)} {...extra} />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>{record ? "Editar parceiro" : "Novo parceiro"}</SheetTitle>
          <SheetDescription>Clientes e fornecedores usados no financeiro e faturamento.</SheetDescription>
        </SheetHeader>
        <fieldset disabled={readOnly} className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
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

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {field("razao_social", pf ? "Nome Completo" : "Razão Social", "sm:col-span-2")}
            {!pf && field("nome_fantasia", "Nome Fantasia", "sm:col-span-2")}
            <div>
              <Label htmlFor="p-doc" className="mb-1.5 block text-sm font-medium">{pf ? "CPF" : "CNPJ"}</Label>
              <DocumentInput id="p-doc" value={f.documento} placeholder={pf ? "000.000.000-00" : "00.000.000/0000-00"}
                onChange={(v) => set("documento", v.slice(0, pf ? 11 : 14))} />
            </div>
            {!pf && field("inscricao_estadual", "Inscrição Estadual")}
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-sm font-medium">Telefone</Label>
              <PhoneInput value={f.telefone} onChange={(v) => set("telefone", v)} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Endereço</h3>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Label htmlFor="p-cep" className="mb-1.5 block text-sm font-medium">CEP</Label>
                <div className="relative">
                  <Input id="p-cep" inputMode="numeric" placeholder="00000-000" value={formatCep(f.cep)}
                    onChange={(e) => { const d = digitsOnly(e.target.value).slice(0, 8); set("cep", d); if (d.length === 8) lookupCep(d); }} />
                  {cepLoading && <Loader2 className="text-muted-foreground absolute top-2.5 right-3 h-4 w-4 animate-spin" />}
                </div>
              </div>
              {field("endereco", "Endereço", "sm:col-span-4")}
              {field("numero", "Número", "sm:col-span-2")}
              {field("complemento", "Complemento", "sm:col-span-4")}
              {field("bairro", "Bairro", "sm:col-span-2")}
              {field("cidade", "Cidade", "sm:col-span-3")}
              {field("uf", "UF", "sm:col-span-1", { maxLength: 2, className: "uppercase" })}
            </div>
          </div>
        </fieldset>
        <div className="bg-background sticky bottom-0 flex justify-end gap-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={readOnly || saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
