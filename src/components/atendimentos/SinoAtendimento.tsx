import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterPayload } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import {
  SINO_INTERVALOS, SINO_MAX_LIMITE, aposEnvio, desligarSino, lerSino, ligarSino, sinoVencido, textoSino,
} from "@/lib/sino-atendimento";

type Props = {
  atendimentoId: string;
  atendimento: Row | undefined;
  colsAt: string[] | undefined;
  nomeCliente: string;
  encerrado: boolean;
  /** Envia ao cliente pelo WhatsApp e grava no histórico. */
  enviar: (conteudo: string) => Promise<void>;
  onChange: () => void;
};

const temColunas = (cols?: string[]) => !cols || cols.includes("sino_ativo");

async function gravar(id: string, patch: Record<string, unknown>, cols?: string[]) {
  const { error } = await supabase.from("atendimentos").update(filterPayload(patch, cols)).eq("id", id);
  if (error) throw error;
}

/** Desliga o sino (usado quando o atendente responde manualmente). */
export async function desarmarSino(id: string, atendimento: Row | undefined, cols?: string[]) {
  if (atendimento?.["sino_ativo"] !== true) return;
  await gravar(id, desligarSino(), cols).catch(console.error);
}

export function SinoBotao(p: Props) {
  const s = lerSino(p.atendimento);
  const [aberto, setAberto] = useState(false);
  const [intervalo, setIntervalo] = useState(s.intervaloMin);
  const [max, setMax] = useState(s.maxEnvios);
  const [msg, setMsg] = useState(s.mensagem);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) { setIntervalo(s.intervaloMin); setMax(s.maxEnvios); setMsg(s.mensagem); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  if (p.encerrado) return null;

  async function ligar() {
    if (!temColunas(p.colsAt)) { toast.error("Rode o script atendeai-sino-atendimento.sql no SQL Editor antes de usar o sino."); return; }
    if (!msg.trim()) { toast.error("Escreva a mensagem."); return; }
    setSalvando(true);
    try {
      await gravar(p.atendimentoId, ligarSino({ intervaloMin: intervalo, mensagem: msg.trim(), maxEnvios: max }, new Date()), p.colsAt);
      toast.success(`Sino ligado: aviso a cada ${intervalo} min, até ${max}x.`);
      setAberto(false);
      p.onChange();
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  }
  async function desligar() {
    await gravar(p.atendimentoId, desligarSino(), p.colsAt).catch((e) => toast.error((e as Error).message));
    toast.success("Sino desligado.");
    setAberto(false);
    p.onChange();
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Sino de espera" title="Sino de espera (avisar o cliente periodicamente)"
          className={cn(s.ativo && "text-primary")}>
          <Bell className={cn("h-5 w-5", s.ativo && "animate-pulse")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="font-semibold">Sino de espera</p>
          <p className="text-xs text-muted-foreground">Envia ao cliente uma mensagem de tranquilização de tempos em tempos. Desliga sozinho quando você responder.</p>
        </div>
        <div className="space-y-1">
          <Label>Enviar a cada</Label>
          <div className="flex gap-1">
            {SINO_INTERVALOS.map((m) => (
              <Button key={m} type="button" size="sm" variant={intervalo === m ? "default" : "outline"} onClick={() => setIntervalo(m)}>{m} min</Button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label>No máximo</Label>
          <div className="flex gap-1">
            {Array.from({ length: SINO_MAX_LIMITE }, (_, i) => i + 1).map((n) => (
              <Button key={n} type="button" size="sm" variant={max === n ? "default" : "outline"} onClick={() => setMax(n)}>{n}x</Button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Mensagem</Label>
          <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">Use {"{nome}"} para o primeiro nome do cliente. Prévia: {textoSino(msg, p.nomeCliente)}</p>
        </div>
        <div className="flex justify-end gap-2">
          {s.ativo && <Button variant="outline" size="sm" onClick={() => void desligar()}><BellOff className="mr-1 h-4 w-4" /> Desligar</Button>}
          <Button size="sm" disabled={salvando} onClick={() => void ligar()}><Bell className="mr-1 h-4 w-4" /> {s.ativo ? "Religar" : "Ligar sino"}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Tarja com contagem regressiva; dispara o aviso quando vence. */
export function SinoTarja(p: Props) {
  const s = lerSino(p.atendimento);
  const [agora, setAgora] = useState(() => Date.now());
  const disparando = useRef(false);

  useEffect(() => {
    if (!s.ativo) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s.ativo]);

  useEffect(() => {
    if (p.encerrado && s.ativo) { void gravar(p.atendimentoId, desligarSino(), p.colsAt).then(p.onChange).catch(console.error); return; }
    if (disparando.current || !sinoVencido(s, new Date(agora))) return;
    disparando.current = true;
    void (async () => {
      try {
        // Reserva o envio no banco (evita duplicar se duas telas estiverem abertas).
        const r = aposEnvio(s, new Date());
        const { data, error } = await supabase.from("atendimentos")
          .update(filterPayload({ sino_envios_feitos: r.sino_envios_feitos, sino_ativo: r.sino_ativo, sino_proximo_envio: r.sino_proximo_envio }, p.colsAt))
          .eq("id", p.atendimentoId).eq("sino_envios_feitos", s.enviosFeitos).eq("sino_ativo", true).select("id");
        if (error) throw error;
        if (data && data.length) {
          await p.enviar(textoSino(s.mensagem, p.nomeCliente));
          if (r.limiteAtingido) toast.warning(`Atenção: limite de avisos de espera atingido para ${p.nomeCliente}. Responda o cliente.`, { duration: 15000 });
        }
      } catch (e) { console.error(e); }
      disparando.current = false;
      p.onChange();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agora, s.ativo, s.proximoEnvio, p.encerrado]);

  if (!s.ativo || !s.proximoEnvio) return null;
  const falta = Math.max(0, Math.floor((new Date(s.proximoEnvio).getTime() - agora) / 1000));
  const mm = String(Math.floor(falta / 60)).padStart(2, "0");
  const ss = String(falta % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-2 border-b border-border bg-accent px-3 py-1.5 text-xs text-accent-foreground">
      <Bell className="h-3.5 w-3.5 animate-pulse" />
      <span className="flex-1">Aviso de espera ativo: próximo envio em <b>{mm}:{ss}</b> (envio {s.enviosFeitos + 1} de {s.maxEnvios})</span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
        onClick={() => void gravar(p.atendimentoId, desligarSino(), p.colsAt).then(() => { toast.success("Sino desligado."); p.onChange(); })}>
        Desligar agora
      </Button>
    </div>
  );
}
