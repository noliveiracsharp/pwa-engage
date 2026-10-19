import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleHelp, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { verificarNumeroWhatsApp } from "@/lib/ofertas-acompanhamento.functions";
import { telefoneConsulta } from "@/lib/whatsapp-verificacao";

export function WhatsAppStatus({ telefone }: { telefone: string }) {
  const consultar = useServerFn(verificarNumeroWhatsApp);
  const [resultado, setResultado] = useState<{ status: string; mensagem?: string | undefined } | null>(null);
  const [revisao, setRevisao] = useState(0);
  const numero = telefoneConsulta(telefone);
  useEffect(() => {
    let ativo = true;
    setResultado(null);
    if (!numero) return;
    const timer = setTimeout(() => { void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!ativo || !data.session) return;
      setResultado({ status: "consultando" });
      try {
        const r = await consultar({ data: { telefone, atualizar: revisao > 0 } });
        if (ativo) setResultado(r);
      } catch { if (ativo) setResultado({ status: "indisponivel" }); }
    })(); }, 700);
    return () => { ativo = false; clearTimeout(timer); };
  }, [numero, telefone, revisao, consultar]);
  if (!numero || !resultado) return null;
  const status = resultado.status;
  const Icon = status === "consultando" ? Loader2 : status === "possui" ? CheckCircle2 : status === "nao_possui" ? XCircle : CircleHelp;
  return <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground" role="status" title={resultado.mensagem}>
    <Icon className={`h-3.5 w-3.5 ${status === "consultando" ? "animate-spin" : ""}`} />
    <span>{status === "consultando" ? "Consultando WhatsApp…" : status === "possui" ? "Possui WhatsApp" : status === "nao_possui" ? "Não possui WhatsApp" : "Não foi possível verificar"}</span>
    {status !== "consultando" && <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Consultar novamente" aria-label="Consultar WhatsApp novamente" onClick={() => setRevisao(r => r + 1)}><RefreshCw className="h-3 w-3" /></Button>}
  </div>;
}
