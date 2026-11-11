import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Row } from "@/lib/row";
import { slugAgenda } from "@/lib/agendamento";
import { s } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canUpdate: boolean };
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
  const [f, setF] = useState({ ativo: false, slug: "", toque_segundos: 20, menores_recebem: false, central_ativa: true, mostrar_administracao: true });
  const [qr, setQr] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const c = cfgQ.data;
    if (cfgQ.isLoading) return;
    setF(c ? { ativo: c["ativo"] === true, slug: s(c["slug"]), toque_segundos: Number(c["toque_segundos"] ?? 20), menores_recebem: c["menores_recebem"] === true, central_ativa: c["central_ativa"] !== false, mostrar_administracao: c["mostrar_administracao"] !== false }
      : (x) => ({ ...x, slug: slugAgenda(nomeCondominio).slice(0, 50) || `cond-${condominioId.slice(0, 8)}` }) as never);
  }, [cfgQ.data, cfgQ.isLoading, nomeCondominio, condominioId]);

  const link = typeof window !== "undefined" && f.slug ? `${window.location.origin}/interfone/${f.slug}` : "";
  useEffect(() => { if (link) void QRCode.toDataURL(link, { width: 480, margin: 2 }).then(setQr); }, [link]);

  const salvar = async () => {
    if (!/^[a-z0-9-]{3,60}$/.test(f.slug)) return toast.error("Endereço: use de 3 a 60 letras minúsculas, números ou hífen.");
    setSalvando(true);
    const { error } = await db.from("cond_interfone_config").upsert({ condominio_id: condominioId, ...f, updated_at: new Date().toISOString() });
    setSalvando(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Este endereço já está em uso por outro condomínio." : error.message);
    toast.success("Interfone salvo.");
    void qc.invalidateQueries({ queryKey: ["cond", "interfone_config", condominioId] });
  };

  const imprimir = () => {
    const w = document.createElement("iframe");
    w.style.position = "fixed"; w.style.width = "0"; w.style.height = "0"; w.style.border = "0";
    document.body.appendChild(w);
    const d = w.contentDocument!;
    d.open();
    d.write(`<html><head><title>Interfone</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="margin:0">${nomeCondominio.replace(/</g, "")}</h1><p style="font-size:20px">Interfone virtual — aponte a câmera do celular</p><img src="${qr}" style="width:320px;height:320px"/><p style="font-size:14px;color:#555">Chame a unidade, a portaria ou a administração por vídeo.<br/>Nenhum dado de morador é exibido.</p></body></html>`);
    d.close();
    setTimeout(() => { w.contentWindow?.print(); setTimeout(() => w.remove(), 1000); }, 300);
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
      <TabsList><TabsTrigger value="config">Configuração e QR Code</TabsTrigger><TabsTrigger value="historico">Histórico</TabsTrigger></TabsList>
      <TabsContent value="config">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {sw("ativo", "Interfone ligado", "Quando desligado, o QR Code mostra que o interfone está indisponível.")}
            <div className="space-y-1.5">
              <Label htmlFor="if-slug">Endereço do interfone</Label>
              <Input id="if-slug" disabled={!perms.canUpdate} value={f.slug} onChange={(e) => setF((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="if-toque">Segundos tocando antes de passar para o próximo</Label>
              <Input id="if-toque" type="number" min={10} max={120} disabled={!perms.canUpdate} value={f.toque_segundos} onChange={(e) => setF((x) => ({ ...x, toque_segundos: Math.min(120, Math.max(10, Number(e.target.value) || 20)) }))} />
              <p className="text-xs text-muted-foreground">Ordem: titular → demais moradores → prestadores marcados → central. Quem já foi chamado continua tocando.</p>
            </div>
            {sw("menores_recebem", "Menores de idade recebem chamadas", "Desligado: só toca para maiores de 18 anos.")}
            {sw("central_ativa", "Encaminhar para a central", "Se ninguém da unidade atender, toca para a equipe da gestão.")}
            {sw("mostrar_administracao", "Mostrar botão Administração", "Além da Portaria, que sempre aparece.")}
            <p className="flex items-start gap-1.5 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> LGPD: o visitante não vê nomes, telefones nem se a unidade está ocupada. Foto e horário ficam guardados por 90 dias e só a gestão vê o histórico. Para escolher quem recebe, abra a unidade → pessoa → Permissões.</p>
            {perms.canUpdate && <div className="flex justify-end"><Button disabled={salvando} onClick={() => void salvar()}>Salvar</Button></div>}
          </div>
          <div className="space-y-3 rounded-lg border bg-card p-4 text-center">
            {qr ? <img src={qr} alt="QR Code do interfone" className="mx-auto w-56" /> : <div className="mx-auto size-56 rounded bg-muted" />}
            <p className="break-all text-xs text-muted-foreground">{link}</p>
            {!f.ativo && <p className="text-xs text-warning">Ligue e salve para o QR Code funcionar.</p>}
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado."); }}><Copy className="size-4" /> Copiar</Button>
              <Button size="sm" variant="outline" asChild><a href={qr} download={`interfone-${f.slug}.png`}><Download className="size-4" /> Baixar</a></Button>
              <Button size="sm" variant="outline" onClick={imprimir} disabled={!qr}><Printer className="size-4" /> Imprimir</Button>
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
