import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Building, Copy, Globe, Info, Mail, MapPin, MessageCircle, Navigation, Pencil, Phone, Plus, Search, ShieldCheck, Siren, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { rowId, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { coordenadas } from "@/lib/parceiros-mapa";
import { formatPhoneDisplay } from "@/lib/input-masks";
import { EMERGENCIAS, TIPOS_CONTATO, linkTelefone, linkWhats, linksRota } from "@/lib/cond-contatos";
import { MODALIDADES_PORTARIA } from "./GestaoTerceirosPanel";
import { s, useCondRows, useCondSalvar } from "./cond-data";

const MapaCondominio = lazy(() => import("./MapaCondominio"));
type P = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

const nomeDe = (r?: Row) => (r ? s(pick(r, ["nome_fantasia", "titulo", "razao_social", "nome"])) : "");
const enderecoDe = (r?: Row) => {
  if (!r) return { l1: "", l2: "", full: "" };
  const l1 = [[r["endereco"], r["numero"]].filter(Boolean).join(", "), r["complemento"]].filter(Boolean).join(" — ");
  const l2 = [r["bairro"], [r["cidade"], r["uf"]].filter(Boolean).join(" - "), r["cep"] ? `CEP ${s(r["cep"])}` : ""].filter(Boolean).join(", ");
  return { l1, l2, full: [l1, l2].filter(Boolean).join(", ") };
};
const fone = (v: string) => (/^\d{3}$/.test(v) ? v : formatPhoneDisplay(v) || v);

export function MeuCondominioPanel({ condominioId, perms }: { condominioId: string; perms: P }) {
  const { data: parceiros = [] } = useTableRows("parceiros");
  const byId = (id: unknown) => parceiros.find((p) => s(rowId(p)) === s(id));
  const cond = byId(condominioId);
  const adm = cond && s(cond["tipo_gestao"]) !== "autogestao" ? byId(cond["administradora_id"]) : undefined;
  const fac = cond ? byId(cond["facilities_id"]) : undefined;
  const end = enderecoDe(cond);
  const c = cond ? coordenadas(cond) : null;
  const rota = linksRota(c?.[0] ?? null, c?.[1] ?? null, end.full);
  const nome = nomeDe(cond) || "Condomínio";

  const copiar = async () => {
    try { await navigator.clipboard.writeText(`${nome} — ${end.full}`); toast.success("Endereço copiado."); }
    catch { toast.error("Não foi possível copiar."); }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-4">
        <section aria-labelledby="mc-local" className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-3">
            <h2 id="mc-local" className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-primary" aria-hidden />Endereço</h2>
            {end.full ? (
              <address className="not-italic text-sm leading-relaxed">
                <span className="block font-medium">{nome}</span>
                {end.l1 && <span className="block">{end.l1}</span>}
                {end.l2 && <span className="block text-muted-foreground">{end.l2}</span>}
              </address>
            ) : <p className="text-sm text-muted-foreground">Endereço não cadastrado. Complete no cadastro do condomínio.</p>}
            <div className="flex flex-wrap gap-2">
              {end.full && <Button variant="outline" size="sm" onClick={copiar}><Copy className="mr-1.5 size-4" aria-hidden />Copiar endereço</Button>}
              {(c || end.full) && <>
                <Button size="sm" asChild><a href={rota.waze} target="_blank" rel="noopener noreferrer"><Navigation className="mr-1.5 size-4" aria-hidden />Waze<span className="sr-only"> (abre em nova aba)</span></a></Button>
                <Button size="sm" variant="secondary" asChild><a href={rota.maps} target="_blank" rel="noopener noreferrer"><MapPin className="mr-1.5 size-4" aria-hidden />Google Maps<span className="sr-only"> (abre em nova aba)</span></a></Button>
              </>}
            </div>
            {cond?.["telefone"] ? <LinhaContato icone={Phone} rotulo="Telefone" valor={s(cond["telefone"])} tipo="telefone" /> : null}
          </div>
          {c ? (
            <ClientOnly fallback={<div className="h-72 animate-pulse rounded-lg bg-muted" />}>
              <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-muted" />}><MapaCondominio lat={c[0]} lng={c[1]} nome={nome} /></Suspense>
            </ClientOnly>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <MapPin className="size-6" aria-hidden />Localização ainda não definida. No cadastro do condomínio, use “Localizar no mapa” para gravar o ponto.
            </div>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <CardEmpresa titulo="Administradora" icone={Building} empresa={adm} vazio={s(cond?.["tipo_gestao"]) === "autogestao" ? "Condomínio em autogestão." : "Nenhuma administradora vinculada."} extra={s(cond?.["cond_contato_administradora"])} />
          <CardEmpresa titulo="Facilities & Portaria" icone={ShieldCheck} empresa={fac} vazio="Nenhuma empresa de facilities vinculada."
            extra={MODALIDADES_PORTARIA.find((m) => m.value === s(cond?.["cond_portaria_modalidade"]))?.label ?? ""}
            telExtra={s(cond?.["cond_contato_portaria"])} />
        </div>

        <ContatosUteis condominioId={condominioId} perms={perms} />
      </div>
    </TooltipProvider>
  );
}

function CardEmpresa({ titulo, icone: Icone, empresa, vazio, extra, telExtra }: { titulo: string; icone: typeof Building; empresa?: Row; vazio: string; extra?: string; telExtra?: string }) {
  const end = enderecoDe(empresa);
  const logo = s(empresa?.["logo"]);
  return (
    <section aria-label={titulo} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icone className="size-4 text-primary" aria-hidden />{titulo}</h2>
      {!empresa ? <p className="text-sm text-muted-foreground">{vazio}</p> : (
        <>
          <div className="flex items-center gap-3">
            {logo ? <img src={logo} alt={`Logo de ${nomeDe(empresa)}`} className="h-12 w-20 shrink-0 rounded object-contain" />
              : <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{nomeDe(empresa).slice(0, 2).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="truncate font-semibold">{nomeDe(empresa)}</p>
              {empresa["documento"] ? <p className="text-xs text-muted-foreground">CNPJ {s(empresa["documento"])}</p> : null}
            </div>
          </div>
          {end.full && <address className="flex gap-2 text-sm not-italic text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{end.full}</address>}
          <div className="space-y-1">
            {empresa["telefone"] ? <LinhaContato icone={Phone} rotulo="Telefone" valor={s(empresa["telefone"])} tipo="telefone" /> : null}
            {empresa["telefone2"] ? <LinhaContato icone={Phone} rotulo="Telefone 2" valor={s(empresa["telefone2"])} tipo="telefone" /> : null}
            {telExtra ? <LinhaContato icone={Siren} rotulo="Portaria / emergência" valor={telExtra} tipo="telefone" /> : null}
            {empresa["email"] ? <LinhaContato icone={Mail} rotulo="E-mail" valor={s(empresa["email"])} tipo="email" /> : null}
          </div>
        </>
      )}
      {extra && <p className="flex gap-2 border-t pt-2 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{extra}</p>}
    </section>
  );
}

function Acao({ href, rotulo, icone: Icone }: { href: string; rotulo: string; icone: typeof Phone }) {
  const externo = href.startsWith("http");
  return (
    <Tooltip><TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="size-8" asChild>
        <a href={href} aria-label={rotulo} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}><Icone className="size-4" aria-hidden /></a>
      </Button>
    </TooltipTrigger><TooltipContent>{rotulo}</TooltipContent></Tooltip>
  );
}

function LinhaContato({ icone: Icone, rotulo, valor, tipo }: { icone: typeof Phone; rotulo: string; valor: string; tipo: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{rotulo}: </span>
      <span className="min-w-0 flex-1 truncate">{tipo === "telefone" ? fone(valor) : valor}</span>
      <AcoesValor valor={valor} tipo={tipo} rotulo={rotulo} />
    </div>
  );
}

function AcoesValor({ valor, tipo, rotulo }: { valor: string; tipo: string; rotulo: string }) {
  if (tipo === "telefone") {
    const t = linkTelefone(valor), w = linkWhats(valor);
    return <>{t && <Acao href={t} rotulo={`Ligar para ${rotulo}`} icone={Phone} />}{w && <Acao href={w} rotulo={`WhatsApp de ${rotulo}`} icone={MessageCircle} />}</>;
  }
  if (tipo === "email") return <Acao href={`mailto:${valor}`} rotulo={`Enviar e-mail para ${rotulo}`} icone={Mail} />;
  if (tipo === "link") return <Acao href={/^https?:/i.test(valor) ? valor : `https://${valor}`} rotulo={`Abrir ${rotulo}`} icone={Globe} />;
  return null;
}

function ContatosUteis({ condominioId, perms }: { condominioId: string; perms: P }) {
  const { data: rows = [], error } = useCondRows("cond_contatos_uteis", "condominio_id", condominioId, "ordem");
  const salvar = useCondSalvar("cond_contatos_uteis");
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...rows].sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0) || s(a["titulo"]).localeCompare(s(b["titulo"]), "pt-BR"))
      .filter((r) => !q || `${s(r["titulo"])} ${s(r["valor"])} ${s(r["descricao"])}`.toLowerCase().includes(q));
  }, [rows, busca]);
  const semTabela = !!error && /relation|schema cache|does not exist/i.test(String((error as Error).message));

  const excluir = async (r: Row) => {
    if (!(await confirmar({ title: "Excluir contato?", description: `“${s(r["titulo"])}” deixará de aparecer para todos.`, confirmText: "Excluir", destructive: true }))) return;
    salvar.mutate({ id: s(r["id"]), excluir: true }, { onSuccess: () => toast.success("Contato excluído.") });
  };

  return (
    <section aria-labelledby="mc-contatos" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="mc-contatos" className="mr-auto flex items-center gap-2 font-semibold"><Phone className="size-4 text-primary" aria-hidden />Contatos úteis</h2>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato" aria-label="Buscar contato" className="pl-8" />
        </div>
        {perms.canCreate && !semTabela && <Button onClick={() => setEdit({})}><Plus className="mr-1.5 size-4" aria-hidden />Novo contato</Button>}
      </div>
      {semTabela && <p role="alert" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">Rode o script atendeai-condominios-meu-condominio.sql no banco para cadastrar contatos.</p>}
      {!semTabela && lista.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{busca ? "Nenhum contato encontrado." : "Nenhum contato cadastrado ainda (ex.: zelador, e-mail da administração interna)."}</p>}
      <ul className="divide-y">
        {lista.map((r) => (
          <li key={s(r["id"])} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s(r["titulo"])}</p>
              <p className="truncate text-sm text-muted-foreground">{s(r["tipo"]) === "telefone" ? fone(s(r["valor"])) : s(r["valor"])}{r["descricao"] ? ` · ${s(r["descricao"])}` : ""}</p>
            </div>
            <AcoesValor valor={s(r["valor"])} tipo={s(r["tipo"])} rotulo={s(r["titulo"])} />
            {perms.canUpdate && <Acao2 rotulo={`Editar ${s(r["titulo"])}`} icone={Pencil} onClick={() => setEdit(r)} />}
            {perms.canDelete && <Acao2 rotulo={`Excluir ${s(r["titulo"])}`} icone={Trash2} onClick={() => void excluir(r)} />}
          </li>
        ))}
      </ul>
      <div className="border-t pt-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Siren className="size-4" aria-hidden />Emergências</h3>
        <div className="flex flex-wrap gap-2">
          {EMERGENCIAS.map((e) => (
            <Button key={e.valor} variant="outline" size="sm" asChild>
              <a href={`tel:${e.valor}`} aria-label={`Ligar para ${e.titulo}, ${e.valor}`}><Phone className="mr-1.5 size-3.5" aria-hidden />{e.titulo} <strong className="ml-1">{e.valor}</strong></a>
            </Button>
          ))}
        </div>
      </div>
      {edit && <ContatoDialog condominioId={condominioId} inicial={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function Acao2({ rotulo, icone: Icone, onClick }: { rotulo: string; icone: typeof Phone; onClick: () => void }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={rotulo} onClick={onClick}><Icone className="size-4" aria-hidden /></Button></TooltipTrigger><TooltipContent>{rotulo}</TooltipContent></Tooltip>;
}

function ContatoDialog({ condominioId, inicial, onClose }: { condominioId: string; inicial: Row; onClose: () => void }) {
  const salvar = useCondSalvar("cond_contatos_uteis");
  const [f, setF] = useState({ titulo: s(inicial["titulo"]), tipo: s(inicial["tipo"]) || "telefone", valor: s(inicial["valor"]), descricao: s(inicial["descricao"]), ordem: s(inicial["ordem"] ?? "0") });
  const id = s(inicial["id"]);
  const ok = () => {
    if (!f.titulo.trim() || !f.valor.trim()) { toast.error("Preencha a identificação e o contato."); return; }
    if (f.tipo === "email" && !/^\S+@\S+\.\S+$/.test(f.valor.trim())) { toast.error("E-mail inválido."); return; }
    const valores = { condominio_id: condominioId, titulo: f.titulo.trim(), tipo: f.tipo, valor: f.valor.trim(), descricao: f.descricao.trim() || null, ordem: Number(f.ordem) || 0 };
    salvar.mutate(id ? { id, valores } : { valores }, { onSuccess: () => { toast.success("Contato salvo."); onClose(); } });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{id ? "Editar contato" : "Novo contato"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label htmlFor="cu-t" className="mb-1.5 block">Identificação</Label><Input id="cu-t" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Zelador — Carlos" autoFocus /></div>
          <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={f.tipo} options={[...TIPOS_CONTATO].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))} onChange={(v) => setF({ ...f, tipo: v || "telefone" })} /></div>
          <div><Label htmlFor="cu-v" className="mb-1.5 block">{f.tipo === "telefone" ? "Telefone" : f.tipo === "email" ? "E-mail" : f.tipo === "link" ? "Endereço do site" : "Detalhe"}</Label>
            <Input id="cu-v" value={f.valor} inputMode={f.tipo === "telefone" ? "tel" : f.tipo === "email" ? "email" : "text"} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder={f.tipo === "telefone" ? "(11) 99999-9999" : ""} /></div>
          <div><Label htmlFor="cu-d" className="mb-1.5 block">Observação (opcional)</Label><Input id="cu-d" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: seg a sex, 8h às 17h" /></div>
          <div><Label htmlFor="cu-o" className="mb-1.5 block">Ordem na lista</Label><Input id="cu-o" type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} className="w-28" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={ok} disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
