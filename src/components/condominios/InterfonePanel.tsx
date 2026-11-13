import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Building2, Copy, Download, ExternalLink, KeyRound, LocateFixed, MapPin, Printer, ShieldCheck } from "lucide-react";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Row } from "@/lib/row";
import { s } from "./cond-data";
import { gerarFolhaA4Placas, gerarPlacaInterfone } from "./placa-interfone";
import { InterfoneRamais } from "./InterfoneRamais";
import { InterfonePontos } from "./InterfonePontos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canUpdate: boolean };
// Endereço opaco: 16 caracteres aleatórios, sem o nome do condomínio, impossível de adivinhar.
function codigoAleatorio(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}
const STATUS: Record<string, { l: string; c: string }> = {
  chamando: { l: "Chamando", c: "bg-primary/15 text-primary" },
  atendida: { l: "Atendida", c: "bg-success/15 text-success" },
  encerrada: { l: "Atendida", c: "bg-success/15 text-success" },
  nao_atendida: { l: "Não atendida", c: "bg-warning/15 text-foreground" },
  cancelada: { l: "Cancelada", c: "bg-muted text-muted-foreground" },
};

export function InterfonePanel({ condominioId, nomeCondominio, blocos, unidades, perms }: { condominioId: string; nomeCondominio: string; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const cfgQ = useQuery({
    queryKey: ["cond", "interfone_config", condominioId],
    queryFn: async () => { const r = await db.from("cond_interfone_config").select("*").eq("condominio_id", condominioId).maybeSingle(); if (r.error) throw r.error; return r.data as Row | null; },
  });
  const histQ = useQuery({
    queryKey: ["cond", "interfone_hist", condominioId],
    queryFn: async () => { const r = await db.from("cond_interfone_chamadas").select("id,destino,cond_unidade_id,visitante_nome,motivo,status,atendido_por,created_at,porta_aberta_em,foto").eq("condominio_id", condominioId).order("created_at", { ascending: false }).limit(100); if (r.error) throw r.error; return (r.data ?? []) as Row[]; },
    refetchInterval: 15000,
  });
  const [f, setF] = useState({ ativo: false, slug: "", toque_segundos: 20, menores_recebem: false, central_ativa: true, mostrar_administracao: true, geo_ativo: false, geo_lat: null as number | null, geo_lng: null as number | null, geo_raio_m: 150 });
  const [localizando, setLocalizando] = useState(false);
  const [qr, setQr] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const c = cfgQ.data;
    if (cfgQ.isLoading) return;
    setF(c ? { ativo: c["ativo"] === true, slug: s(c["slug"]), toque_segundos: Number(c["toque_segundos"] ?? 20), menores_recebem: c["menores_recebem"] === true, central_ativa: c["central_ativa"] !== false, mostrar_administracao: c["mostrar_administracao"] !== false, geo_ativo: c["geo_ativo"] === true, geo_lat: c["geo_lat"] == null ? null : Number(c["geo_lat"]), geo_lng: c["geo_lng"] == null ? null : Number(c["geo_lng"]), geo_raio_m: Number(c["geo_raio_m"] ?? 150) }
      : (x) => ({ ...x, slug: codigoAleatorio() }));
  }, [cfgQ.data, cfgQ.isLoading, nomeCondominio, condominioId]);

  const link = typeof window !== "undefined" && f.slug ? `${window.location.origin}/interfone/${f.slug}` : "";
  useEffect(() => { if (link) void QRCode.toDataURL(link, { width: 900, margin: 1, errorCorrectionLevel: "H" }).then(setQr); }, [link]);

  const salvar = async (): Promise<void> => {
    if (!/^[a-z0-9-]{3,60}$/.test(f.slug)) { toast.error("Endereço: use de 3 a 60 letras minúsculas, números ou hífen."); return; }
    if (f.geo_ativo && (f.geo_lat == null || f.geo_lng == null)) { toast.error("Marque a localização do portão antes de ligar a cerca virtual."); return; }
    setSalvando(true);
    const { error } = await db.from("cond_interfone_config").upsert({ condominio_id: condominioId, ...f, updated_at: new Date().toISOString() });
    setSalvando(false);
    if (error) { toast.error(error.message.includes("duplicate") ? "Este endereço já está em uso por outro condomínio." : error.message); return; }
    toast.success("Interfone salvo.");
    void qc.invalidateQueries({ queryKey: ["cond", "interfone_config", condominioId] });
  };

  const novoLink = async () => {
    const ok = await confirmar({ title: "Gerar novo link?", description: "O QR Code atual deixa de funcionar na hora. Você precisará imprimir e colar o novo no portão.", confirmText: "Gerar novo link" });
    if (ok) { setF((x) => ({ ...x, slug: codigoAleatorio() })); toast.info("Novo link gerado. Clique em Salvar para valer."); }
  };
  const marcarLocal = () => {
    if (!navigator.geolocation) { toast.error("Este aparelho não informa localização."); return; }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocalizando(false); setF((x) => ({ ...x, geo_lat: p.coords.latitude, geo_lng: p.coords.longitude })); toast.success(`Local marcado (precisão de ${Math.round(p.coords.accuracy)} m). Clique em Salvar.`); },
      () => { setLocalizando(false); toast.error("Não foi possível obter a localização. Permita o acesso no navegador."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const baixar = async () => {
    const png = await gerarFolhaA4Placas(await gerarPlacaInterfone(nomeCondominio, qr));
    const a = document.createElement("a"); a.href = png; a.download = `placas-interfone-A4-${f.slug}.png`; a.click();
  };
  const imprimir = async () => {
    const png = await gerarPlacaInterfone(nomeCondominio, qr);
    const w = document.createElement("iframe");
    w.style.position = "fixed"; w.style.width = "0"; w.style.height = "0"; w.style.border = "0";
    document.body.appendChild(w);
    const d = w.contentDocument!;
    d.open();
    // Folha A4 com 4 placas (1/4 da folha cada, 95×142 mm) e linhas tracejadas de corte.
    const cel = `<div class="c"><img src="${png}"/></div>`;
    d.write(`<html><head><title>Interfone</title><style>@page{size:A4;margin:0}html,body{margin:0}
.f{width:210mm;height:297mm;display:grid;grid-template-columns:105mm 105mm;grid-template-rows:148.5mm 148.5mm;position:relative}
.c{display:flex;align-items:center;justify-content:center}.c img{width:95mm;height:142.5mm;display:block}
.v{position:absolute;left:105mm;top:0;bottom:0;border-left:0.3mm dashed #999}.h{position:absolute;top:148.5mm;left:0;right:0;border-top:0.3mm dashed #999}
.t{position:absolute;font:7pt sans-serif;color:#999;left:107mm;top:2mm}</style></head><body><div class="f">${cel}${cel}${cel}${cel}<div class="v"></div><div class="h"></div><span class="t">✂ recorte nas linhas tracejadas</span></div></body></html>`);
    d.close();
    const img = d.querySelector("img")!;
    const go = () => { w.contentWindow?.print(); setTimeout(() => w.remove(), 1000); };
    if (img.complete) setTimeout(go, 100); else img.onload = go;
  };

  const rotUnid = (id: unknown) => {
    const u = unidades.find((x) => s(x["id"]) === s(id));
    if (!u) return "—";
    const b = blocos.find((x) => s(x["id"]) === s(u["cond_bloco_id"]));
    return `${b ? s(b["nome"]) + " · " : ""}${s(u["numero"])}`;
  };
  const sw = (k: keyof typeof f, l: string, d: string) => (
    <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <span>{l}<span className="block text-xs text-muted-foreground">{d}</span></span>
      <Switch disabled={!perms.canUpdate} checked={f[k] as boolean} onCheckedChange={(c) => setF((x) => ({ ...x, [k]: c }))} />
    </label>
  );

  return (
    <Tabs defaultValue="config" className="space-y-4">
      <TabsList><TabsTrigger value="config">Configuração e QR Code</TabsTrigger><TabsTrigger value="pontos">Pontos de QR Code</TabsTrigger><TabsTrigger value="ramais">Ramais</TabsTrigger><TabsTrigger value="historico">Histórico</TabsTrigger></TabsList>
      <TabsContent value="pontos"><InterfonePontos condominioId={condominioId} nomeCondominio={nomeCondominio} canUpdate={perms.canUpdate} /></TabsContent>
      <TabsContent value="ramais"><InterfoneRamais condominioId={condominioId} canUpdate={perms.canUpdate} /></TabsContent>
      <TabsContent value="config">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><Building2 className="size-4 text-primary" /> Configurando o interfone do condomínio <b>{nomeCondominio || "—"}</b></div>
            {sw("ativo", "Interfone ligado", "Quando desligado, o QR Code mostra que o interfone está indisponível.")}
            <div className="space-y-1.5">
              <Label htmlFor="if-slug">Endereço do interfone</Label>
              <div className="flex gap-2">
                <Input id="if-slug" readOnly value={f.slug} className="font-mono" />
                {perms.canUpdate && <Button type="button" variant="outline" onClick={() => void novoLink()}><KeyRound className="size-4" /> Gerar novo link</Button>}
              </div>
              <p className="text-xs text-muted-foreground">Código aleatório, sem o nome do condomínio. Se o QR Code vazar ou for arrancado, gere um novo e o antigo para de funcionar.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="if-toque">Segundos tocando antes de passar para o próximo</Label>
              <Input id="if-toque" type="number" min={10} max={120} disabled={!perms.canUpdate} value={f.toque_segundos} onChange={(e) => setF((x) => ({ ...x, toque_segundos: Math.min(120, Math.max(10, Number(e.target.value) || 20)) }))} />
              <p className="text-xs text-muted-foreground">Ordem: titular → demais moradores → prestadores marcados → central. Quem já foi chamado continua tocando.</p>
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-primary" /><span>Cerca virtual (só chama quem está no portão)<span className="block text-xs text-muted-foreground">O visitante precisa permitir a localização e estar perto do condomínio. Evita trotes e ataques à distância.</span></span></span>
                <Switch disabled={!perms.canUpdate} checked={f.geo_ativo} onCheckedChange={(c) => setF((x) => ({ ...x, geo_ativo: c }))} />
              </label>
              {f.geo_ativo && (
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <div className="space-y-1.5">
                    <Label>Local do portão</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={!perms.canUpdate || localizando} onClick={marcarLocal}><LocateFixed className="size-4" /> {localizando ? "Localizando..." : "Usar minha localização atual"}</Button>
                      {f.geo_lat != null && f.geo_lng != null
                        ? <a className="text-xs text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${f.geo_lat},${f.geo_lng}`}>Ver no mapa</a>
                        : <span className="text-xs text-warning">Ainda não marcado</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">Faça isso em pé, ao lado do portão, com o celular.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="if-raio">Distância máxima (metros)</Label>
                    <Input id="if-raio" type="number" min={30} max={2000} disabled={!perms.canUpdate} value={f.geo_raio_m} onChange={(e) => setF((x) => ({ ...x, geo_raio_m: Math.min(2000, Math.max(30, Number(e.target.value) || 150)) }))} />
                  </div>
                </div>
              )}
            </div>
            {sw("menores_recebem", "Menores de idade recebem chamadas", "Desligado: só toca para maiores de 18 anos.")}
            {sw("central_ativa", "Encaminhar para a central", "Se ninguém da unidade atender, toca para a equipe da gestão.")}
            {sw("mostrar_administracao", "Mostrar botão Administração", "Além da Portaria, que sempre aparece.")}
            <p className="flex items-start gap-1.5 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> LGPD: o visitante não vê nomes, telefones nem se a unidade está ocupada. Foto e horário ficam guardados por 90 dias e só a gestão vê o histórico. Para escolher quem recebe, abra a unidade → pessoa → Permissões.</p>
            {perms.canUpdate && <div className="flex justify-end"><Button disabled={salvando} onClick={() => void salvar()}>Salvar</Button></div>}
          </div>
          <div className="space-y-3 rounded-lg border bg-card p-4 text-center">
            <p className="text-sm font-semibold">{nomeCondominio}</p>
            {qr ? <img src={qr} alt="QR Code do interfone" className="mx-auto w-56" /> : <div className="mx-auto size-56 rounded bg-muted" />}
            <p className="break-all text-xs text-muted-foreground">{link}</p>
            {!f.ativo && <p className="text-xs text-warning">Ligue e salve para o QR Code funcionar.</p>}
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado."); }}><Copy className="size-4" /> Copiar</Button>
              <Button size="sm" variant="outline" onClick={() => void baixar()} disabled={!qr}><Download className="size-4" /> Baixar 4 placas (A4)</Button>
              <Button size="sm" variant="outline" onClick={() => void imprimir()} disabled={!qr}><Printer className="size-4" /> Imprimir 4 placas (A4)</Button>
              <Button size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Testar</a></Button>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="historico">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Quando</th><th className="p-2">Visitante</th><th className="p-2">Destino</th><th className="p-2">Situação</th><th className="p-2">Entrada</th></tr></thead>
            <tbody>
              {(histQ.data ?? []).map((c) => {
                const st = STATUS[s(c["status"])] ?? { l: s(c["status"]), c: "" };
                return (
                  <tr key={s(c["id"])} className="border-t">
                    <td className="whitespace-nowrap p-2">{new Date(s(c["created_at"])).toLocaleString("pt-BR")}</td>
                    <td className="p-2"><div className="flex items-center gap-2">{c["foto"] ? <img src={s(c["foto"])} alt="" className="h-8 w-12 rounded object-cover" /> : null}<span>{s(c["visitante_nome"])}{c["motivo"] ? <span className="block text-xs text-muted-foreground">{s(c["motivo"])}</span> : null}</span></div></td>
                    <td className="p-2">{c["destino"] === "unidade" ? rotUnid(c["cond_unidade_id"]) : c["destino"] === "portaria" ? "Portaria" : "Administração"}</td>
                    <td className="p-2"><Badge variant="outline" className={st.c}>{st.l}</Badge></td>
                    <td className="p-2 text-xs">{c["porta_aberta_em"] ? new Date(s(c["porta_aberta_em"])).toLocaleTimeString("pt-BR") : "—"}</td>
                  </tr>
                );
              })}
              {!histQ.data?.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma chamada ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </TabsContent>
    </Tabs>
  );
}
