/**
 * Fila de envio de avisos em segundo plano. Vive fora dos componentes: fechar a janela do aviso
 * ou trocar de tela dentro do sistema não interrompe o envio. Cada aviso é processado a partir das
 * linhas "pendente" do banco, então reenviar, agendar e retomar usam o mesmo caminho.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { htmlParaTexto } from "@/lib/html-texto";
import { enviarWhatsappEmpresa } from "@/lib/manutencoes";
import { TIPOS_AVISO, imagensDoHtml, preencherAviso } from "@/lib/cond-avisos";
import type { Row } from "@/lib/row";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const s = (v: unknown) => (v == null ? "" : String(v));
const PARALELO = 5;
const URL_PUBLICA = "https://pwa-engage.lovable.app";

export type TarefaEnvio = { avisoId: string; titulo: string; total: number; feito: number; falhas: number; estado: "fila" | "enviando" | "concluido" | "erro"; erro?: string };

let tarefas: TarefaEnvio[] = [];
const ouvintes = new Set<() => void>();
const emitir = () => { tarefas = [...tarefas]; ouvintes.forEach((f) => f()); };
const atualizar = (id: string, p: Partial<TarefaEnvio>) => { tarefas = tarefas.map((t) => (t.avisoId === id ? { ...t, ...p } : t)); emitir(); };
let aoConcluir: (() => void) | null = null;
export function quandoConcluirEnvio(f: () => void) { aoConcluir = f; }

export function useFilaAvisos() {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => tarefas, () => tarefas);
}
export function dispensarTarefa(id: string) { tarefas = tarefas.filter((t) => t.avisoId !== id); emitir(); }
export const enviandoAgora = () => tarefas.some((t) => t.estado === "fila" || t.estado === "enviando");

function origemPublica() {
  if (typeof window === "undefined") return URL_PUBLICA;
  const o = window.location.origin;
  return /localhost|id-preview|lovableproject/.test(o) ? URL_PUBLICA : o;
}

/** Lê todas as linhas em páginas de 1.000 (o banco limita cada resposta). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buscarTodos(tabela: string, filtro: (q: any) => any, colunas = "*"): Promise<Row[]> {
  const out: Row[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(db.from(tabela).select(colunas)).order("id").range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Grava muitas linhas em lotes de 500. */
export async function inserirEmLotes(tabela: string, linhas: Row[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await db.from(tabela).insert(linhas.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

let fila = Promise.resolve();

/** Coloca o aviso na fila. Pode ser chamado várias vezes; o mesmo aviso não entra duas vezes. */
export function enfileirarAviso(o: { avisoId: string; titulo: string; empresaId: string; nomeCondominio: string }) {
  if (tarefas.some((t) => t.avisoId === o.avisoId && (t.estado === "fila" || t.estado === "enviando"))) return;
  tarefas = [...tarefas.filter((t) => t.avisoId !== o.avisoId), { avisoId: o.avisoId, titulo: o.titulo, total: 0, feito: 0, falhas: 0, estado: "fila" }];
  emitir();
  fila = fila.then(() => processar(o)).catch(() => undefined);
}

async function processar({ avisoId, empresaId, nomeCondominio }: { avisoId: string; empresaId: string; nomeCondominio: string }) {
  try {
    const { data: av, error } = await db.from("cond_avisos").select("*").eq("id", avisoId).single();
    if (error) throw new Error(error.message);
    const envios = await buscarTodos("cond_avisos_envios", (q) => q.eq("aviso_id", avisoId).eq("status", "pendente"));
    atualizar(avisoId, { estado: "enviando", total: envios.length, feito: 0, falhas: 0 });
    await db.from("cond_avisos").update({ status: "enviando", iniciado_em: new Date().toISOString(), agendado_para: null }).eq("id", avisoId);

    const titulo = s(av.titulo).trim();
    const mensagem = s(av.mensagem);
    const tipoLabel = TIPOS_AVISO.find((t) => t.value === av.tipo)?.label ?? s(av.tipo);
    const midia = av.midia_url ? { url: s(av.midia_url), tipo: av.midia_tipo as "imagem" | "video" | "documento", nome: s(av.midia_nome) } : undefined;
    const imagensTexto = imagensDoHtml(mensagem);
    const textoPlano = htmlParaTexto(mensagem);
    const origem = origemPublica();
    let feito = 0, falhas = 0, i = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function um(e: any) {
      const vars = { nome: s(e.nome), unidade: s(e.unidades), condominio: nomeCondominio };
      let motivo: string | null = null;
      try {
        if (e.canal === "whatsapp") {
          const texto = `*${titulo}*\n\n${preencherAviso(textoPlano, vars)}\n\n👉 Ver comunicado oficial: ${origem}/aviso/${s(e.id)}`;
          const midias = [...imagensTexto.map((url, n) => ({ url, tipo: "imagem" as const, nome: `imagem-${n + 1}.jpg` })), ...(midia ? [midia] : [])];
          if (!midias.length) motivo = await enviarWhatsappEmpresa(empresaId, s(e.destino), texto);
          for (let k = 0; k < midias.length && !motivo; k++) motivo = await enviarWhatsappEmpresa(empresaId, s(e.destino), k === 0 ? texto : "", midias[k]);
        } else {
          const link = `<p style="margin:24px 0 0"><a href="${origem}/aviso/${s(e.id)}" target="_blank" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600">Ver comunicado oficial</a></p>`;
          const pixel = `<img src="${origem}/api/public/aviso-lido/${s(e.id)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
          const { data, error: fe } = await supabase.functions.invoke("cobranca-regua", { body: { acao: "cond_aviso_email", condominio_id: av.condominio_id, para: e.destino, nome: e.nome, unidades: e.unidades, titulo, tipo_label: tipoLabel, mensagem: preencherAviso(mensagem, vars) + link + pixel, midia_url: midia?.url, midia_tipo: midia?.tipo, midia_nome: midia?.nome } });
          motivo = fe ? fe.message : (data as Row | null)?.["erro"] ? s((data as Row)["erro"]) : null;
        }
      } catch (x) { motivo = x instanceof Error ? x.message : "Falha no envio."; }
      if (motivo) falhas++;
      await db.from("cond_avisos_envios").update(motivo ? { status: "falha", erro: motivo } : { status: "enviado", erro: null, enviado_em: new Date().toISOString() }).eq("id", e.id);
      feito++;
      atualizar(avisoId, { feito, falhas });
    }
    // Alguns envios em paralelo: rápido para 2.000+ unidades sem estourar o provedor.
    await Promise.all(Array.from({ length: Math.min(PARALELO, envios.length) }, async () => { while (i < envios.length) await um(envios[i++]!); }));

    const { count: ok } = await db.from("cond_avisos_envios").select("id", { count: "exact", head: true }).eq("aviso_id", avisoId).eq("status", "enviado");
    const { count: fa } = await db.from("cond_avisos_envios").select("id", { count: "exact", head: true }).eq("aviso_id", avisoId).eq("status", "falha");
    const { data: atual } = await db.from("cond_avisos").select("status").eq("id", avisoId).single();
    await db.from("cond_avisos").update({ enviados: ok ?? 0, falhas: fa ?? 0, finalizado_em: new Date().toISOString(), ...(atual?.status === "enviando" ? { status: "enviado" } : {}) }).eq("id", avisoId);
    atualizar(avisoId, { estado: "concluido" });
  } catch (x) {
    atualizar(avisoId, { estado: "erro", erro: x instanceof Error ? x.message : "Falha no envio." });
  }
  aoConcluir?.();
}
