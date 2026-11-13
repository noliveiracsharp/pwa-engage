import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Camera, Delete, DoorOpen, Headset, Loader2, MapPin, Phone, PhoneOff, ShieldAlert, ShieldCheck, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalaWebRTC } from "@/components/atendimentos/SalaWebRTC";
import { lerDiscagem, ramalDiscado, type RamalPublico } from "@/lib/interfone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/interfone/$slug")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Interfone virtual do condomínio" },
      { name: "description", content: "Chame a unidade, a portaria ou a administração por vídeo, direto pelo celular." },
      { property: "og:title", content: "Interfone virtual do condomínio" },
      { property: "og:description", content: "Leia o QR Code e chame por vídeo, sem instalar nada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Interfone,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Unid = { id: string; numero: string };
type Bloco = { id: string; nome: string; unidades: Unid[] };
type Dados = { nome: string; logo: string; administracao: boolean; geo?: boolean; blocos: Bloco[]; ramais?: RamalPublico[]; ponto?: { nome: string; tipo: "portao" | "espaco" | "sos" } | null };
type Alvo = { destino: "unidade" | "portaria" | "administracao" | "ramal"; unidade?: string; ramal?: string; rotulo: string };
type Status = { status: string; etapa?: number; total?: number; central?: boolean; sala?: string };

function Interfone() {
  const { slug } = Route.useParams();
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [chamada, setChamada] = useState<{ id: string; token: string } | null>(null);
  const [st, setSt] = useState<Status | null>(null);

  useEffect(() => {
    void db.rpc("cond_interfone_publico", { p_slug: slug }).then(({ data }: { data: Dados | null }) => setDados(data ?? null));
  }, [slug]);

  useEffect(() => {
    if (!chamada || (st && st.status !== "chamando")) return;
    const t = setInterval(async () => {
      const { data } = await db.rpc("cond_interfone_visitante", { p_id: chamada.id, p_token: chamada.token, p_cancelar: false });
      if (data) setSt(data as Status);
    }, 2000);
    return () => clearInterval(t);
  }, [chamada, st]);

  // Avisa por WhatsApp a cada nova etapa do transbordo (o servidor só envia para quem ainda não recebeu).
  const etapa = st?.status === "chamando" ? (st.etapa ?? 0) : -1;
  useEffect(() => {
    if (!chamada || etapa < 0) return;
    void fetch("/api/public/interfone-whats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chamada) }).catch(() => undefined);
  }, [chamada, etapa]);

  const encerrar = async () => {
    if (chamada) await db.rpc("cond_interfone_visitante", { p_id: chamada.id, p_token: chamada.token, p_cancelar: true });
    setSt({ status: st?.status === "atendida" ? "encerrada" : "cancelada" });
  };
  const reiniciar = () => { setAlvo(null); setChamada(null); setSt(null); };

  if (dados === undefined) return <Tela><Loader2 className="mx-auto size-8 animate-spin text-primary" /></Tela>;
  if (dados === null) return <Tela><p className="text-center text-muted-foreground">Este interfone não está disponível no momento.</p></Tela>;

  if (st?.status === "atendida" && st.sala && chamada) {
    return (
      <div className="flex h-dvh flex-col bg-background">
        <SalaWebRTC sala={st.sala} nome="Visitante" video onSair={() => void encerrar()} className="flex-1" />
      </div>
    );
  }

  return (
    <Tela>
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        {dados.logo ? <img src={dados.logo} alt={dados.nome} className="h-12 max-w-[180px] object-contain" /> : <Building2 className="size-10 text-primary" />}
        <h1 className="text-xl font-semibold">{dados.nome}</h1>
        <p className="text-sm text-muted-foreground">Interfone virtual</p>
        {dados.ponto && <p className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><MapPin className="size-3.5" aria-hidden /> Você está em: {dados.ponto.nome}</p>}
      </header>

      {!alvo ? (
        <Escolher dados={dados} onEscolher={setAlvo} />
      ) : !chamada ? (
        <Identificar slug={slug} exigeGeo={dados.geo === true} alvo={alvo} onVoltar={() => setAlvo(null)} onChamou={(c) => { setChamada(c); setSt({ status: "chamando", etapa: 1 }); }} />
      ) : st?.status === "chamando" ? (
        <div className="space-y-6 text-center" aria-live="polite">
          <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-primary/15">
            <Phone className="size-10 animate-pulse text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold">Chamando {alvo.rotulo}…</p>
            <p className="text-sm text-muted-foreground">
              {st.central ? "Encaminhando para a central de atendimento." : st.etapa && st.etapa > 1 ? "Tentando outros contatos da unidade." : "Aguarde, estamos avisando."}
            </p>
          </div>
          <Button variant="destructive" size="lg" className="w-full" onClick={() => void encerrar()}><PhoneOff className="size-5" /> Cancelar chamada</Button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-lg font-semibold">
            {st?.status === "nao_atendida" ? "Ninguém atendeu agora." : st?.status === "encerrada" ? "Chamada encerrada." : "Chamada cancelada."}
          </p>
          {st?.status === "nao_atendida" && <p className="text-sm text-muted-foreground">Tente novamente em alguns instantes ou chame a portaria.</p>}
          <Button className="w-full" onClick={reiniciar}>Nova chamada</Button>
        </div>
      )}

      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Nenhum dado de morador é exibido. Sua imagem e o horário ficam registrados para a segurança do condomínio.
      </p>
    </Tela>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-muted/40 px-4 py-8"><div className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">{children}</div></main>;
}

function Escolher({ dados, onEscolher }: { dados: Dados; onEscolher: (a: Alvo) => void }) {
  const [digito, setDigito] = useState("");
  const [bloco, setBloco] = useState(dados.blocos[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const multi = dados.blocos.length > 1;
  const ramais = dados.ramais ?? [];
  const temUnid = dados.blocos.some((b) => b.unidades.length > 0);
  const sos = dados.ponto?.tipo === "sos";
  const tecla = (k: string) => { setErro(""); setDigito((d) => (d + k).slice(0, 8)); };
  const discar = () => {
    const rm = ramalDiscado(digito, ramais);
    if (rm) return onEscolher({ destino: "ramal", ramal: rm.id, rotulo: `${rm.nome} (ramal ${rm.ramal})` });
    if (!temUnid) return setErro("Ramal não encontrado. Confira o número.");
    const l = lerDiscagem(digito);
    const achados = l ? dados.blocos.flatMap((b) => b.unidades.filter((u) => u.numero.toUpperCase() === l.numero && (!l.bloco || b.nome.toUpperCase().includes(l.bloco))).map((u) => ({ b, u }))) : [];
    if (achados.length === 1) return onEscolher({ destino: "unidade", unidade: achados[0]!.u.id, rotulo: `${multi ? achados[0]!.b.nome + " · " : ""}unidade ${achados[0]!.u.numero}` });
    setErro(achados.length > 1 ? "Há mais de uma torre com esse número. Escolha pela aba Torres." : "Unidade não encontrada. Confira o número.");
  };
  const unidades = dados.blocos.find((b) => b.id === bloco)?.unidades ?? [];
  return (
    <div className="space-y-5">
      {sos && (
        <Button size="lg" variant="destructive" className="h-20 w-full text-lg" onClick={() => onEscolher({ destino: "portaria", rotulo: "a portaria (emergência)" })}>
          <ShieldAlert className="size-6" aria-hidden /> Emergência · chamar portaria
        </Button>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant="outline" className="h-16 flex-col gap-1" onClick={() => onEscolher({ destino: "portaria", rotulo: "a portaria" })}><DoorOpen className="size-5" /> Portaria</Button>
        {dados.administracao && <Button size="lg" variant="outline" className="h-16 flex-col gap-1" onClick={() => onEscolher({ destino: "administracao", rotulo: "a administração" })}><Headset className="size-5" /> Administração</Button>}
      </div>
      {ramais.some((x) => x.atalho !== false) && (
        <section aria-labelledby="if-ramais" className="space-y-2">
          <h2 id="if-ramais" className="text-sm font-medium">Ramais</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ramais.filter((x) => x.atalho !== false).map((x) => (
              <li key={x.id}>
                <Button variant="outline" className="h-auto w-full justify-between py-2" onClick={() => onEscolher({ destino: "ramal", ramal: x.id, rotulo: `${x.nome} (ramal ${x.ramal})` })} aria-label={`Chamar ${x.nome}, ramal ${x.ramal}`}>
                  <span className="truncate text-left">{x.nome}</span><span className="font-mono text-xs text-muted-foreground">{x.ramal}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Tabs defaultValue="teclado">
        <TabsList className={cn("grid w-full", temUnid ? "grid-cols-2" : "grid-cols-1")}><TabsTrigger value="teclado">{temUnid ? "Digitar número" : "Digitar ramal"}</TabsTrigger>{temUnid && <TabsTrigger value="torres">Torres</TabsTrigger>}</TabsList>
        <TabsContent value="teclado" className="space-y-3 pt-2">
          <div className="flex h-14 items-center justify-center rounded-lg border bg-muted/50 text-3xl font-semibold tracking-widest" aria-live="polite">{digito || <span className="text-base font-normal text-muted-foreground">{!temUnid ? "Ex.: 15" : multi ? "Ex.: B-102 ou ramal" : "Ex.: 102 ou ramal"}</span>}</div>
          {erro && <p className="text-center text-sm text-destructive">{erro}</p>}
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => <Button key={k} variant="secondary" className="h-14 text-xl" onClick={() => tecla(k)}>{k}</Button>)}
            <Button variant="secondary" className="h-14 text-xl" onClick={() => tecla("*")} aria-label="Asterisco">*</Button>
            <Button variant="secondary" className="h-14 text-xl" onClick={() => tecla("0")}>0</Button>
            <Button variant="ghost" className="h-14" onClick={() => setDigito((d) => d.slice(0, -1))} aria-label="Apagar"><Delete className="size-5" /></Button>
          </div>
          {digito && <Button variant="ghost" size="sm" className="w-full" onClick={() => setDigito("")}>Limpar</Button>}
          {multi && (
            <div className="flex flex-wrap justify-center gap-1">
              {[...new Set(dados.blocos.map((b) => (b.nome.match(/[A-Za-z]+\s*$/)?.[0] ?? "").trim().toUpperCase()).filter((x) => x.length === 1))].map((l) => <Button key={l} size="sm" variant="outline" onClick={() => setDigito((d) => `${l}-${d.replace(/^[A-Z]+-?/, "")}`)}>{l}</Button>)}
            </div>
          )}
          <Button size="lg" className="w-full" disabled={!digito} onClick={discar}><Phone className="size-5" /> Chamar</Button>
        </TabsContent>
        {temUnid && <TabsContent value="torres" className="space-y-3 pt-2">
          {multi && (
            <div className="flex flex-wrap gap-2">
              {dados.blocos.map((b) => <Button key={b.id} size="sm" variant={b.id === bloco ? "default" : "outline"} onClick={() => setBloco(b.id)}>{b.nome}</Button>)}
            </div>
          )}
          <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto">
            {unidades.map((u) => {
              const b = dados.blocos.find((x) => x.id === bloco)!;
              return <Button key={u.id} variant="secondary" className="h-12" onClick={() => onEscolher({ destino: "unidade", unidade: u.id, rotulo: `${multi ? b.nome + " · " : ""}unidade ${u.numero}` })}>{u.numero}</Button>;
            })}
            {!unidades.length && <p className="col-span-4 py-6 text-center text-sm text-muted-foreground">Nenhuma unidade nesta torre.</p>}
          </div>
        </TabsContent>}
      </Tabs>
    </div>
  );
}

function Identificar({ slug, exigeGeo, alvo, onVoltar, onChamou }: { slug: string; exigeGeo: boolean; alvo: Alvo; onVoltar: () => void; onChamou: (c: { id: string; token: string }) => void }) {
  const [nome, setNome] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const motivos = useMemo(() => ["Entrega", "Visita", "Prestador de serviço", "Aplicativo de transporte"], []);

  useEffect(() => {
    let s: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false }).then((m) => { s = m; setCam(m); }).catch(() => setCam(null));
    return () => s?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => { if (ref.current) ref.current.srcObject = cam; }, [cam]);

  const foto = (): string | null => {
    const v = ref.current;
    if (!v || !cam || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = 320; c.height = Math.round((v.videoHeight / v.videoWidth) * 320);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.6);
  };

  const chamar = async () => {
    if (nome.trim().length < 2) return setErro("Informe seu nome.");
    setEnviando(true); setErro("");
    let pos: { lat: number; lng: number } | null = null;
    if (exigeGeo) {
      pos = await new Promise((ok) => {
        if (!navigator.geolocation) return ok(null);
        navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { enableHighAccuracy: true, timeout: 15000 });
      });
      if (!pos) { setEnviando(false); return setErro("Permita a localização: este interfone só funciona no portão do condomínio."); }
    }
    const { data, error } = await db.rpc("cond_interfone_chamar_v2", { p_slug: slug, p_destino: alvo.destino, p_unidade: alvo.unidade ?? null, p_ramal: alvo.ramal ?? null, p_nome: nome, p_motivo: motivo, p_foto: foto(), p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null });
    setEnviando(false);
    if (error) return setErro(error.message || "Não foi possível chamar agora.");
    cam?.getTracks().forEach((t) => t.stop());
    onChamou(data as { id: string; token: string });
  };

  return (
    <div className="space-y-4">
      <p className="text-center text-sm">Você vai chamar <b>{alvo.rotulo}</b> por vídeo.</p>
      <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg bg-muted">
        <video ref={ref} autoPlay playsInline muted className={cn("h-full w-full -scale-x-100 object-cover", !cam && "hidden")} />
        {!cam && <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground"><Camera className="size-6" /> Permita a câmera para ser identificado</div>}
      </div>
      <div className="space-y-1.5"><Label htmlFor="if-nome">Seu nome</Label><Input id="if-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="name" /></div>
      <div className="space-y-1.5">
        <Label htmlFor="if-motivo">Motivo</Label>
        <div className="flex flex-wrap gap-1.5">{motivos.map((m) => <Button key={m} type="button" size="sm" variant={motivo === m ? "default" : "outline"} onClick={() => setMotivo(m)}>{m}</Button>)}</div>
        <Input id="if-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder="Ou descreva" />
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onVoltar}>Voltar</Button>
        <Button className="flex-1" size="lg" disabled={enviando} onClick={() => void chamar()}>{enviando ? <Loader2 className="size-5 animate-spin" /> : <Video className="size-5" />} Chamar por vídeo</Button>
      </div>
    </div>
  );
}
