import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleHelp, Contact, Loader2, Mail, Phone, Plus, Star, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { WhatsAppStatus } from "@/components/data-table/WhatsAppStatus";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { emailValido, FINALIDADES } from "@/lib/contatos";
import { validarEmailProvedor } from "@/lib/contatos.functions";

type Contato = { id: string; tipo: "telefone" | "email"; valor: string; finalidade: string; nome: string | null; principal: boolean; ativo: boolean };
type Props = { entidade: "parceiro" | "empresa"; entidadeId: string };

const finLabel = (v: string) => FINALIDADES.find((f) => f.value === v)?.label ?? v;

function EmailStatus({ email }: { email: string }) {
  const validar = useServerFn(validarEmailProvedor);
  const [st, setSt] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true; setSt(null);
    if (!emailValido(email)) return;
    const t = setTimeout(() => { setSt("consultando"); void validar({ data: { email } }).then((r) => ativo && setSt(r.status)).catch(() => ativo && setSt("indisponivel")); }, 600);
    return () => { ativo = false; clearTimeout(t); };
  }, [email, validar]);
  if (!email) return null;
  if (!emailValido(email)) return <p className="flex items-center gap-1 text-xs text-destructive"><XCircle className="h-3.5 w-3.5" /> Formato de e-mail inválido</p>;
  if (!st) return null;
  const Icon = st === "consultando" ? Loader2 : st === "valido" ? CheckCircle2 : st === "sem_provedor" ? XCircle : CircleHelp;
  const txt = st === "consultando" ? "Consultando provedor…" : st === "valido" ? "Provedor de e-mail confirmado" : st === "sem_provedor" ? "Domínio não recebe e-mails (confira a digitação)" : "Não foi possível consultar o provedor";
  return <p className={`flex items-center gap-1 text-xs ${st === "sem_provedor" ? "text-destructive" : "text-muted-foreground"}`}><Icon className={`h-3.5 w-3.5 ${st === "consultando" ? "animate-spin" : ""}`} /> {txt}</p>;
}

export function ContatosButton({ entidade, entidadeId }: Props) {
  const [open, setOpen] = useState(false);
  const [lista, setLista] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [novo, setNovo] = useState({ tipo: "telefone" as "telefone" | "email", valor: "", finalidade: "financeiro", nome: "", principal: false });

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("cadastro_contatos" as never).select("*").eq("entidade", entidade).eq("entidade_id", entidadeId).order("tipo").order("created_at");
    setCarregando(false);
    if (error) return void toast.error(/cadastro_contatos/.test(error.message) ? "Rode o script atendeai-contatos-reajuste.sql no banco." : error.message);
    setLista((data ?? []) as Contato[]);
  };
  useEffect(() => { if (open) void carregar(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const adicionar = async () => {
    const valor = novo.tipo === "email" ? novo.valor.trim().toLowerCase() : novo.valor.replace(/\D/g, "");
    if (novo.tipo === "email" && !emailValido(valor)) return void toast.error("E-mail inválido.");
    if (novo.tipo === "telefone" && valor.length < 10) return void toast.error("Telefone incompleto.");
    if (novo.principal) await supabase.from("cadastro_contatos" as never).update({ principal: false } as never).eq("entidade", entidade).eq("entidade_id", entidadeId).eq("tipo", novo.tipo);
    const { error } = await supabase.from("cadastro_contatos" as never).insert({ entidade, entidade_id: entidadeId, tipo: novo.tipo, valor, finalidade: novo.finalidade, nome: novo.nome || null, principal: novo.principal } as never);
    if (error) return void toast.error(error.code === "23505" ? "Este contato já está cadastrado." : error.message);
    setNovo((s) => ({ ...s, valor: "", nome: "", principal: false }));
    toast.success("Contato adicionado."); void carregar();
  };
  const alterar = async (c: Contato, patch: Partial<Contato>) => {
    if (patch.principal) await supabase.from("cadastro_contatos" as never).update({ principal: false } as never).eq("entidade", entidade).eq("entidade_id", entidadeId).eq("tipo", c.tipo);
    const { error } = await supabase.from("cadastro_contatos" as never).update(patch as never).eq("id", c.id);
    if (error) return void toast.error(error.message);
    void carregar();
  };
  const remover = async (c: Contato) => {
    if (!await confirmar(`Remover ${c.valor}?`)) return;
    const { error } = await supabase.from("cadastro_contatos" as never).delete().eq("id", c.id);
    if (error) return void toast.error(error.message);
    void carregar();
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Contact className="mr-1 h-4 w-4" /> Contatos</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Telefones e e-mails</DialogTitle>
            <DialogDescription>Usados nos envios do sistema: cobranças, boletos, notas fiscais, reajustes e avisos. A finalidade "Financeiro" tem prioridade nas cobranças.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Tipo</Label>
                <Select value={novo.tipo} onValueChange={(v) => setNovo({ ...novo, tipo: v as "telefone" | "email", valor: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="email">E-mail</SelectItem><SelectItem value="telefone">Telefone / WhatsApp</SelectItem></SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Finalidade</Label>
                <Select value={novo.finalidade} onValueChange={(v) => setNovo({ ...novo, finalidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FINALIDADES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1 sm:col-span-2"><Label>{novo.tipo === "email" ? "E-mail" : "Telefone"}</Label>
                {novo.tipo === "email"
                  ? <><Input type="email" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="nome@empresa.com.br" /><EmailStatus email={novo.valor.trim()} /></>
                  : <PhoneInput value={novo.valor} onChange={(v) => setNovo({ ...novo, valor: v })} />}
              </div>
              <div className="space-y-1"><Label>Responsável (opcional)</Label><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
              <div className="flex items-end gap-2 pb-2"><Switch checked={novo.principal} onCheckedChange={(x) => setNovo({ ...novo, principal: x })} /><Label>Principal</Label></div>
            </div>
            <div className="flex justify-end"><Button type="button" onClick={() => void adicionar()}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button></div>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!carregando && lista.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum contato adicional.</p>}
            {lista.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                {c.tipo === "email" ? <Mail className="h-4 w-4 text-muted-foreground" /> : <Phone className="h-4 w-4 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.valor}{c.nome ? <span className="font-normal text-muted-foreground"> · {c.nome}</span> : null}</div>
                  <div className="text-xs text-muted-foreground">{finLabel(c.finalidade)}{c.principal ? " · Principal" : ""}</div>
                  {c.tipo === "telefone" && <WhatsAppStatus telefone={`+${c.valor.startsWith("55") ? c.valor : `55${c.valor}`}`} />}
                </div>
                <Button type="button" size="icon" variant="ghost" title="Tornar principal" aria-label="Tornar principal" onClick={() => void alterar(c, { principal: !c.principal })}><Star className={`h-4 w-4 ${c.principal ? "fill-primary text-primary" : ""}`} /></Button>
                <Switch checked={c.ativo} onCheckedChange={(x) => void alterar(c, { ativo: x })} aria-label="Ativo" />
                <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={() => void remover(c)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
