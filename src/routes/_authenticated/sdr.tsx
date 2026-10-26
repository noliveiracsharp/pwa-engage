import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2, Mail, MapPin, Phone, Radar, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import type { Row } from "@/lib/row";
import { perguntar } from "@/components/layout/DialogoGlobal";
import { buscarLeads, enriquecerCnpj, type LeadEncontrado } from "@/lib/sdr-radar.functions";

export const Route = createFileRoute("/_authenticated/sdr")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Radar de Leads (SDR) — Atende.ai" },
      { name: "description", content: "Encontre novos clientes por segmento e cidade e monte a fila de prospecção do SDR." },
      { property: "og:title", content: "Radar de Leads (SDR) — Atende.ai" },
      { property: "og:description", content: "Descoberta de empresas por segmento e região com enriquecimento por CNPJ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SdrPage,
});

const STATUS = [
  { value: "novo", label: "Novo" },
  { value: "contatado", label: "Contatado" },
  { value: "qualificado", label: "Qualificado" },
  { value: "convertido", label: "Convertido" },
  { value: "descartado", label: "Descartado" },
];

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

const soDigitos = (v: string) => v.replace(/\D/g, "");

function SdrPage() {
  const perms = usePagePermissions("/sdr");
  const { empresaId } = useAudit();
  const qc = useQueryClient();
  const { data: fila = [] } = useTableRows("sdr_leads", perms.canRead);

  const [segmento, setSegmento] = useState("");
  const [cidade, setCidade] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achados, setAchados] = useState<LeadEncontrado[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [q, setQ] = useState("");

  const refsNaFila = useMemo(() => new Set(fila.map((l) => String(l["origem_ref"] ?? ""))), [fila]);
  const recarregar = () => qc.invalidateQueries({ predicate: (x) => JSON.stringify(x.queryKey).includes("sdr_leads") });

  if (!perms.loading && !perms.canRead) return <p className="p-6 text-muted-foreground">Você não tem acesso a esta página.</p>;

  async function buscar() {
    if (segmento.trim().length < 2 || cidade.trim().length < 2) { toast.error("Informe o segmento e a cidade."); return; }
    setBuscando(true); setSel(new Set());
    const r = await buscarLeads({ data: { segmento, cidade, token: await token() } });
    setBuscando(false);
    if (r.erro) { toast.error(r.erro); return; }
    setAchados(r.leads);
    if (!r.leads.length) toast.info("Nenhuma empresa encontrada. Tente um termo mais simples (ex.: condomínio, clínica, indústria).");
  }

  async function enviarParaFila() {
    if (!empresaId) { toast.error("Empresa não identificada."); return; }
    const itens = achados.filter((l) => sel.has(l.ref) && !refsNaFila.has(l.ref));
    if (!itens.length) { toast.info("Os selecionados já estão na fila."); return; }
    setSalvando(true);
    const { error } = await supabase.from("sdr_leads" as never).insert(itens.map((l) => ({
      empresa_id: empresaId, nome: l.nome, segmento: l.segmento, telefone: l.telefone || null,
      whatsapp: soDigitos(l.telefone).length >= 10 ? soDigitos(l.telefone) : null,
      email: l.email || null, site: l.site || null, endereco: l.endereco || null, cidade: l.cidade || null, uf: l.uf || null,
      origem: "radar", origem_ref: l.ref, status: "novo",
    })) as never);
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar. Confirme se o script do Radar de Leads já foi executado."); return; }
    toast.success(`${itens.length} empresa(s) enviada(s) para a fila do SDR.`);
    setSel(new Set());
    recarregar();
  }

  async function atualizar(id: unknown, campos: Record<string, unknown>) {
    const { error } = await supabase.from("sdr_leads" as never).update({ ...campos, updated_at: new Date().toISOString() } as never).eq("id", id as never);
    if (error) { toast.error("Não foi possível atualizar."); return; }
    recarregar();
  }

  async function enriquecer(l: Row) {
    const atual = String(l["cnpj"] ?? "");
        const v = await perguntar({ title: "Enriquecer pelo CNPJ", description: `Informe o CNPJ de ${String(l["nome"])}`, defaultValue: atual, placeholder: "00.000.000/0000-00" });
    const cnpj = soDigitos(String(v ?? ""));
    if (!cnpj) return;
    if (cnpj.length !== 14) { toast.error("CNPJ deve ter 14 dígitos."); return; }
    const r = await enriquecerCnpj({ data: { cnpj, token: await token() } });
    if (r.erro || !r.dados) { toast.error(r.erro ?? "Falha na consulta."); return; }
    const d = r.dados;
    await atualizar(l["id"], {
      cnpj, razao_social: d.razao_social, atividade: d.atividade, socios: d.socios,
      email: l["email"] || d.email || null, telefone: l["telefone"] || d.telefone || null,
      cidade: l["cidade"] || d.cidade || null, uf: l["uf"] || d.uf || null,
    });
    toast.success(`Dados da Receita carregados: ${d.socios.length} sócio(s).`);
  }

  const filaFiltrada = fila
    .filter((l) => matchesAny([l["nome"], l["segmento"], l["cidade"], l["cnpj"], l["razao_social"], l["email"], l["telefone"]], q))
    .sort((a, b) => String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? "")));
  const todosSel = achados.length > 0 && achados.every((l) => sel.has(l.ref) || refsNaFila.has(l.ref));

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Radar className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Radar de Leads</h1>
          <p className="text-sm text-muted-foreground">Encontre empresas do seu público-alvo e monte a fila de prospecção do SDR.</p>
        </div>
      </div>

      <Tabs defaultValue="radar">
        <TabsList>
          <TabsTrigger value="radar">Descobrir empresas</TabsTrigger>
          <TabsTrigger value="fila">Fila do SDR ({fila.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="radar" className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="seg">Segmento / público-alvo</Label>
              <Input id="seg" placeholder="Ex.: condomínio, clínica, indústria, escola" value={segmento} onChange={(e) => setSegmento(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cid">Cidade / região</Label>
              <Input id="cid" placeholder="Ex.: Campinas SP" value={cidade} onChange={(e) => setCidade(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
            </div>
            <Button onClick={buscar} disabled={buscando}>
              {buscando ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />} Buscar
            </Button>
          </div>

          {achados.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <span className="text-sm text-muted-foreground">{achados.length} empresa(s) encontrada(s) · {sel.size} selecionada(s)</span>
                {perms.canCreate && (
                  <Button size="sm" onClick={enviarParaFila} disabled={!sel.size || salvando}>
                    {salvando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar para fila do SDR
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={todosSel} onCheckedChange={(v) => setSel(v ? new Set(achados.filter((l) => !refsNaFila.has(l.ref)).map((l) => l.ref)) : new Set())} aria-label="Selecionar todos" />
                    </TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Canais</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {achados.map((l) => {
                    const naFila = refsNaFila.has(l.ref);
                    return (
                      <TableRow key={l.ref}>
                        <TableCell>
                          <Checkbox disabled={naFila} checked={naFila || sel.has(l.ref)} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(l.ref); else n.delete(l.ref); return n; })} aria-label={`Selecionar ${l.nome}`} />
                        </TableCell>
                        <TableCell className="font-medium">{l.nome}{naFila && <Badge variant="secondary" className="ml-2">Na fila</Badge>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground"><MapPin className="mr-1 inline size-3.5" />{[l.endereco, l.cidade, l.uf].filter(Boolean).join(" · ") || "—"}</TableCell>
                        <TableCell><Canais telefone={l.telefone} email={l.email} site={l.site} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Fonte: base pública de mapas. Empresas sem telefone ou e-mail podem ser completadas pelo CNPJ na Fila do SDR.</p>
        </TabsContent>

        <TabsContent value="fila" className="space-y-3">
          <Input placeholder="Buscar por nome, segmento, cidade, CNPJ, e-mail ou telefone" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Canais</TableHead>
                  <TableHead>Sócios</TableHead>
                  <TableHead className="w-44">Situação</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filaFiltrada.map((l) => {
                  const socios = (Array.isArray(l["socios"]) ? l["socios"] : []) as { nome: string }[];
                  return (
                    <TableRow key={String(l["id"])}>
                      <TableCell>
                        <div className="font-medium">{String(l["nome"])}</div>
                        <div className="text-xs text-muted-foreground">{[l["segmento"], l["cidade"], l["uf"], l["cnpj"]].filter(Boolean).map(String).join(" · ")}</div>
                        {l["atividade"] ? <div className="text-xs text-muted-foreground">{String(l["atividade"])}</div> : null}
                      </TableCell>
                      <TableCell><Canais telefone={String(l["telefone"] ?? "")} email={String(l["email"] ?? "")} site={String(l["site"] ?? "")} /></TableCell>
                      <TableCell className="text-xs">{socios.length ? <span title={socios.map((s) => s.nome).join("\n")}><Users className="mr-1 inline size-3.5" />{socios[0]!.nome}{socios.length > 1 ? ` +${socios.length - 1}` : ""}</span> : "—"}</TableCell>
                      <TableCell>
                        <Select value={String(l["status"] ?? "novo")} onValueChange={(v) => atualizar(l["id"], { status: v })} disabled={!perms.canUpdate}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {perms.canUpdate && <Button size="sm" variant="outline" onClick={() => enriquecer(l)}>CNPJ</Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filaFiltrada.length && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma empresa na fila. Use “Descobrir empresas” para começar.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Canais({ telefone, email, site }: { telefone: string; email: string; site: string }) {
  const zap = soDigitos(telefone).length >= 10;
  return (
    <div className="flex flex-wrap gap-1">
      {telefone && <Badge variant="outline" title={telefone}><Phone className="mr-1 size-3" />{zap ? "Telefone/WhatsApp" : "Telefone"}</Badge>}
      {email && <Badge variant="outline" title={email}><Mail className="mr-1 size-3" />E-mail</Badge>}
      {site && <a href={site.startsWith("http") ? site : `https://${site}`} target="_blank" rel="noreferrer"><Badge variant="outline"><Globe className="mr-1 size-3" />Site</Badge></a>}
      {!telefone && !email && !site && <span className="text-xs text-muted-foreground">Sem contato público</span>}
    </div>
  );
}
