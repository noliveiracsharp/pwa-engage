import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";

/** Texto do WhatsApp enviado ao aprovador; o link vira o botão "Acesse" no envio. */
export function mensagemAprovador(d: { nome: string; codigo: string; valor: number; link: string; marca?: string }) {
  const primeiro = d.nome.trim().split(/\s+/)[0] || "aprovador";
  const marca = d.marca?.trim() || "Atende.ai";
  return `Olá, ${primeiro}! A cotação *${d.codigo}* no valor de *${formatBRL(d.valor)}* aguarda a sua aprovação no ${marca}.\n\n${d.link}`;
}

/** Envia WhatsApp a cada aprovador (pela instância de avisos da empresa). Retorna quantos receberam. */
export async function avisarAprovadoresWhatsapp(p: { empresaId: unknown; aprovadores: string[]; codigo: string; valor: number; cotacaoId: string }) {
  if (!p.aprovadores.length) return 0;
  const { data } = await supabase.from("usuarios").select("*").in("id", p.aprovadores as never);
  const { data: emp } = await supabase.from("empresas").select("*").eq("id", p.empresaId as never).maybeSingle();
  const marca = String(pick(emp as Row | null, ["titulo", "nome_fantasia", "nome", "razao_social"]) ?? "");
  const { enviarWhatsappEmpresa } = await import("@/lib/manutencoes");
  const link = `${window.location.origin}/cotacoes?id=${p.cotacaoId}`;
  let ok = 0;
  for (const u of (data ?? []) as Row[]) {
    const tel = String(pick(u, ["telefone", "celular", "whatsapp"]) ?? "");
    const nome = String(pick(u, ["nome", "name", "email"]) ?? "");
    try {
      const erro = await enviarWhatsappEmpresa(p.empresaId, tel, mensagemAprovador({ nome, codigo: p.codigo, valor: p.valor, link, marca }));
      if (!erro) ok++;
    } catch { /* falha de envio não bloqueia o fluxo */ }
  }
  return ok;
}
