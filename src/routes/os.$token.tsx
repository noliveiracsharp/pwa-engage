import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Eraser, Loader2, PenLine, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { OsDocumento } from "@/components/manutencoes/OsDocumento";
import { imprimirElemento } from "@/lib/propostas";
import { formatCpfCnpj } from "@/lib/input-masks";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/os/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Relatório de manutenção — Atende.ai" },
      { name: "description", content: "Relatório da manutenção com checklist, fotos e assinatura do cliente." },
      { property: "og:title", content: "Relatório de manutenção — Atende.ai" },
      { property: "og:description", content: "Relatório da manutenção com checklist, fotos e assinatura do cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OsPublica,
});

type Dados = { encontrado: boolean; os: Row; empresa: Row | null; cliente: Row | null; tecnico: Row | null };
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

function OsPublica() {
  const { token } = Route.useParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [doc, setDoc] = useState("");
  const [rabiscou, setRabiscou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);

  const carregar = async () => {
    const { data, error } = await rpc("obter_os_publica", { _token: token });
    if (error) return setErro("Não foi possível abrir o relatório.");
    const d = data as Dados;
    if (!d?.encontrado) return setErro("Relatório não encontrado ou link inválido.");
    setDados(d);
  };
  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    canvas.current!.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const p = ponto(e);
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#111827";
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = ponto(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    setRabiscou(true);
  };
  const limpar = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setRabiscou(false);
  };

  if (erro) return <div className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">{erro}</div>;
  if (!dados) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const os = dados.os;
  const assinado = !!os["assinado_em"];

  const assinar = async () => {
    setEnviando(true); setMsg("");
    let ip = "";
    try { ip = ((await (await fetch("https://api.ipify.org?format=json")).json()) as { ip: string }).ip; } catch { ip = "indisponível"; }
    const { data, error } = await rpc("assinar_os_publica", {
      _token: token, _nome: nome, _documento: doc.replace(/\D/g, ""), _imagem: canvas.current!.toDataURL("image/png"), _ip: ip,
    });
    setEnviando(false);
    const r = data as { sucesso?: boolean; mensagem?: string } | null;
    if (error || !r?.sucesso) return setMsg(r?.mensagem || "Não foi possível assinar.");
    await carregar();
  };

  return (
    <div className="min-h-screen bg-muted/50">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-2 px-4 py-3">
          <span className="truncate text-sm font-semibold">Ordem {String(os["numero"] ?? "")}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => imprimirElemento("os-publica")}><Printer className="mr-1 h-4 w-4" /> Baixar PDF</Button>
            {!assinado && <Button size="sm" onClick={() => document.getElementById("assinar")?.scrollIntoView({ behavior: "smooth" })}><PenLine className="mr-1 h-4 w-4" /> Assinar</Button>}
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-[900px] space-y-6 px-3 py-6 md:py-10">
        <OsDocumento id="os-publica" os={os} empresa={dados.empresa} cliente={String(dados.cliente?.["nome"] ?? "")} tecnico={String(dados.tecnico?.["nome"] ?? "")} />
        <section id="assinar" className="rounded-xl border bg-card p-5 print:hidden">
          {assinado ? (
            <div className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" /> Relatório assinado por {String(os["assinado_nome"])}. Obrigado!</div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Confirmar o serviço</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Seu nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>CPF (opcional)</Label><Input value={formatCpfCnpj(doc)} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" /></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><Label>Assine com o dedo ou o mouse</Label>
                  <Button variant="ghost" size="sm" onClick={limpar}><Eraser className="mr-1 h-4 w-4" /> Limpar</Button></div>
                <canvas ref={canvas} width={800} height={220} onPointerDown={inicio} onPointerMove={mover} onPointerUp={() => (desenhando.current = false)}
                  className="h-40 w-full touch-none rounded-md border" style={{ background: "#fff" }} data-no-zoom />
              </div>
              {msg && <p className="text-sm text-destructive">{msg}</p>}
              <Button onClick={assinar} disabled={enviando || nome.trim().length < 3 || !rabiscou}>
                {enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Confirmar e assinar
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
