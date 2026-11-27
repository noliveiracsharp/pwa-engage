import { createFileRoute } from "@tanstack/react-router";
import { ehRespostaAutomatica } from "@/lib/instancia-finalidade";
import { extrairTagAcesso, noDoAtalho } from "@/lib/qr-direto";
import { detectarComando, mensagemComando } from "@/lib/comandos-fluxo";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { dispararMensagem } from "@/lib/atendimentos-envio";
import { executarExterno } from "@/lib/fluxos-externo";
import { detectarNota, ehCortesia, notaDaLinha } from "@/lib/csat";
import { interpretarAgente, transcreverAgente, type IaAgente } from "@/lib/crm-agente.server";
import { lerComprovanteUrl } from "@/lib/comprovante-ocr.server";
import { escolhaConvite, textoConviteAgente, type CanalConvite } from "@/lib/crm-agente";
import { executarFluxo, agruparCampos, proximoNoId, type ConexaoFluxo, type EstadoExec, type NoFluxo } from "@/lib/fluxos-motor";

// Recebe as mensagens da Z-API ("Ao receber"). A chave ?k= identifica a instância.
const Payload = z
  .object({
    type: z.string().optional(),
    phone: z.string().max(40).optional(),
    fromMe: z.boolean().optional(),
    isGroup: z.boolean().optional(),
    senderName: z.string().max(200).optional().nullable(),
    chatName: z.string().max(200).optional().nullable(),
    messageId: z.string().max(200).optional(),
    text: z.object({ message: z.string().max(8000).optional() }).partial().optional().nullable(),
    image: z.object({ imageUrl: z.string().optional(), caption: z.string().optional() }).partial().optional().nullable(),
    audio: z.object({ audioUrl: z.string().optional(), mimeType: z.string().optional() }).partial().optional().nullable(),
    video: z.object({ videoUrl: z.string().optional(), caption: z.string().optional() }).partial().optional().nullable(),
    document: z.object({ documentUrl: z.string().optional(), fileName: z.string().optional() }).partial().optional().nullable(),
  })
  .passthrough();

type Recebido = {
  duplicada?: boolean;
  interno?: boolean;
  protocolo?: string | null;
  atendimento_id: string;
  telefone: string;
  instancia: Record<string, unknown>;
  fluxo: { id: string; nos: NoFluxo[]; conexoes: ConexaoFluxo[] } | null;
  execucao: ({ id: string } & EstadoExec) | null;
};

/** Converte o status da Z-API para o usado nos balões. */
export function statusDeZapi(s: string): "enviado" | "entregue" | "lido" | null {
  const v = s.toUpperCase();
  if (v === "READ" || v === "PLAYED" || v === "READ_BY_ME") return "lido";
  if (v === "RECEIVED" || v === "DELIVERED" || v === "DELIVERY_ACK") return "entregue";
  if (v === "SENT") return "enviado";
  return null;
}

function clienteBanco() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (h.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`) h.delete("Authorization");
        h.set("apikey", SUPABASE_PUBLISHABLE_KEY);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const ok = (extra: Record<string, unknown> = {}) => Response.json({ ok: true, ...extra });

export const Route = createFileRoute("/api/public/zapi-webhook")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => ok({ info: "Endereço de recebimento do ConectCon HUB" }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const k = url.searchParams.get("k") ?? "";
        if (!/^[a-f0-9]{20,128}$/i.test(k)) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof Payload>;
        try {
          body = Payload.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const tipoEvt = String(body.type ?? "").toLowerCase();
        const raw0 = body as Record<string, unknown>;
        const db = clienteBanco();

        // Confirmação de entrega/leitura (✓ enviado, ✓✓ entregue, ✓✓ azul lido).
        if (tipoEvt.includes("messagestatus") || (tipoEvt.includes("status") && Array.isArray(raw0["ids"]))) {
          const st = statusDeZapi(String(raw0["status"] ?? ""));
          const ids = (Array.isArray(raw0["ids"]) ? raw0["ids"] : [raw0["messageId"] ?? raw0["id"]])
            .filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 200)
            .slice(0, 100);
          if (!st || ids.length === 0) return ok({ ignorada: true });
          const { error } = await db.rpc("zapi_webhook_status" as never, { p_token: k, p_ids: ids, p_status: st } as never);
          if (error && !/function|schema cache/i.test(error.message)) {
            console.error("zapi-webhook status", error.message);
            return new Response("Erro ao registrar status", { status: 500 });
          }
          return ok({ status: st });
        }

        // Cliente digitando/gravando: avisa a tela do atendimento em tempo real.
        if (tipoEvt.includes("presence")) {
          if (!body.phone || body.isGroup) return ok({ ignorada: true });
          const st = String(raw0["status"] ?? "").toLowerCase();
          const { data: atId, error } = await db.rpc("zapi_webhook_presenca" as never, { p_token: k, p_telefone: body.phone } as never);
          if (error) {
            if (!/function|schema cache/i.test(error.message)) console.error("zapi-webhook presenca", error.message);
            return ok({ ignorada: true });
          }
          if (atId) {
            const canal = db.channel("chat_presence");
            await canal.httpSend("presenca", { atendimento_id: String(atId), status: st }).catch((e: unknown) => console.error("zapi-webhook presenca envio", e));
            void db.removeChannel(canal);
          }
          return ok({ presenca: st });
        }

        // Só mensagens recebidas de contatos (ignora grupos e as enviadas por nós).
        if (body.fromMe || body.isGroup || !body.phone) return ok({ ignorada: true });
        if (/delivery|connected|disconnected/.test(tipoEvt)) return ok({ ignorada: true });

        // Lista de bloqueio (spam): descarta sem abrir atendimento. Sem o script, segue normal.
        {
          const { data: bloq, error: eB } = await db.rpc("atendimento_contato_bloqueado" as never, { p_token: k, p_telefone: body.phone } as never);
          if (eB && !/function|schema cache/i.test(eB.message)) console.error("zapi-webhook bloqueio", eB.message);
          if (bloq === true) return ok({ ignorada: true, bloqueado: true });
        }

        let texto = body.text?.message ?? "";
        // Resposta da lista interativa: o id da linha é o número da opção.
        const lr = (body as Record<string, unknown>)["listResponseMessage"] as { selectedRowId?: string; title?: string } | undefined;
        if (lr?.selectedRowId) texto = String(lr.selectedRowId);
        let tipo = "texto";
        let midia: string | null = null;
        if (body.image?.imageUrl) { tipo = "imagem"; midia = body.image.imageUrl; const b = body as Record<string, unknown>; texto = body.image.caption ?? (typeof b["caption"] === "string" ? b["caption"] : "") ?? body.text?.message ?? ""; if (!texto && body.text?.message) texto = body.text.message; }
        else if (body.audio?.audioUrl) { tipo = "audio"; midia = body.audio.audioUrl; }
        else if (body.video?.videoUrl) { tipo = "video"; midia = body.video.videoUrl; texto = body.video.caption ?? ""; }
        else if (body.document?.documentUrl) { tipo = "documento"; midia = body.document.documentUrl; texto = body.document.fileName ?? ""; }

        // Agente Comercial (agente_crm): roda antes do filtro de notificações, pois só atende colaboradores cadastrados.
        {
          const { data: ag, error: eAg } = await db.rpc("crm_agente_identificar" as never, { p_token: k, p_telefone: body.phone } as never);
          if (eAg && !/function|schema cache/i.test(eAg.message)) console.error("zapi-webhook agente", eAg.message);
          const col = ag as { nome?: string; instancia?: Record<string, unknown> } | null;
          if (col?.instancia) {
            const responder = (t: string) => dispararMensagem({ instancia: col.instancia!, telefone: body.phone!, texto: t, mensagemId: null, atendimentoId: null }).catch((e: unknown) => console.error("zapi-webhook agente envio", e));
            type Pend = { id: string; titulo: string; inicio: string; sala: string; video: boolean; modalidade?: string | null; local?: string | null; duracao_min: number; convidados?: { nome?: string; email?: string; telefone?: string }[] };
            const linkSala = (sala: string, video = true) => `${url.origin}/chamada/${sala}${video ? "" : "?audio=1"}`;
            const concluir = (id: string, enviado: boolean) => db.rpc("crm_agente_reuniao_concluir" as never, { p_token: k, p_telefone: body.phone, p_reuniao: id, p_enviado: enviado } as never);
            // Envia o convite da reunião pelo canal escolhido; devolve a linha de confirmação para o colaborador.
            const enviarConvite = async (r: Pend, canal: CanalConvite): Promise<string> => {
              const link = linkSala(r.sala, r.video);
              if (canal === "email") {
                const para = (r.convidados ?? []).map((c) => String(c.email ?? "").trim()).filter((e) => /\S+@\S+\.\S+/.test(e));
                if (!para.length) return "⚠️ Não encontrei e-mail do cliente. Envie o e-mail por aqui ou responda *2* para receber o convite e repassar no WhatsApp.";
                const res = await fetch(`${SUPABASE_URL}/functions/v1/cobranca-regua`, {
                  method: "POST", headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
                  body: JSON.stringify({ acao: "agente_reuniao_convite", token: k, telefone: body.phone, reuniao_id: r.id, para, link }),
                }).catch(() => null);
                const j = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; erro?: string }) : {};
                if (!res?.ok || !j.ok) return `⚠️ Não consegui enviar o e-mail${j.erro ? ` (${j.erro})` : ""}. Use o botão "Enviar por e-mail" na reunião do Planner.`;
                await concluir(r.id, true);
                return `✉️ Convite enviado por e-mail para ${para.join(", ")}.`;
              }
              const convite = textoConviteAgente({ ...r, link });
              const fone = (r.convidados ?? []).map((c) => String(c.telefone ?? "").replace(/\D/g, "")).find((f) => f.length >= 10);
              await concluir(r.id, true);
              if (fone) {
                await dispararMensagem({ instancia: col.instancia!, telefone: fone.length <= 11 ? `55${fone}` : fone, texto: convite, mensagemId: null, atendimentoId: null });
                return `💬 Convite enviado por WhatsApp para ${fone}.`;
              }
              return `💬 Não tenho o WhatsApp do cliente. Encaminhe a mensagem abaixo para ele:\n\n${convite}`;
            };
            try {
              // Resposta ao menu do convite (1 e-mail / 2 WhatsApp / 3 não enviar) da última reunião agendada pelo Agente.
              const esc = tipo === "texto" ? escolhaConvite(texto) : null;
              if (esc) {
                const { data: pd } = await db.rpc("crm_agente_reuniao_pendente" as never, { p_token: k, p_telefone: body.phone } as never);
                const pend = pd as Pend | null;
                if (pend?.id) {
                  if (esc === "nao") { await concluir(pend.id, false); await responder("👍 Ok, convite não enviado. Você pode enviar depois pelo Planner."); }
                  else await responder(await enviarConvite(pend, esc));
                  return ok({ agente: true });
                }
              }
              const { data: iaRaw, error: eIa } = await db.rpc("crm_agente_ia" as never, { p_token: k, p_telefone: body.phone } as never);
              if (eIa) console.error("zapi-webhook agente ia", eIa.message);
              const ia = (iaRaw ?? null) as IaAgente;
              // Foto (ou PDF) de nota fiscal: OCR e reembolso pendente para o Financeiro aprovar.
              const pdf = tipo === "documento" && /\.pdf$/i.test(texto);
              if (midia && (tipo === "imagem" || pdf)) {
                const legenda = pdf ? "" : texto.trim();
                const leitura = await lerComprovanteUrl(midia, pdf, ia, legenda || undefined);
                if (!leitura.valor) { await responder(`🧾 Não consegui ler o valor da nota${leitura.erro ? ` (${leitura.erro})` : ""}. Tire outra foto mais nítida ou lance em Reembolsos no Hub.`); return ok({ agente: true }); }
                const { error: eR } = await db.rpc("crm_agente_reembolso" as never, { p_token: k, p_telefone: body.phone, p_dados: { ...leitura, comprovante: midia, observacao: legenda || null } } as never);
                if (eR) { console.error("zapi-webhook reembolso", eR.message); await responder(`🧾 Li a nota, mas não consegui lançar (${eR.message}). Tente de novo ou lance em Reembolsos no Hub.`); return ok({ agente: true }); }
                const cat: Record<string, string> = { alimentacao: "Alimentação", combustivel: "Combustível", pedagio: "Pedágio", estacionamento: "Estacionamento", hospedagem: "Hospedagem", transporte: "Transporte", material: "Material", outros: "Outros" };
                const dataBr = leitura.data ? leitura.data.split("-").reverse().join("/") : "hoje";
                await responder([
                  "🧾 *Reembolso registrado!*",
                  `• Estabelecimento: ${leitura.estabelecimento ?? "não identificado"}`,
                  `• Categoria: ${cat[leitura.categoria ?? "outros"] ?? "Outros"}${legenda ? ` (${legenda})` : ""}`,
                  `• Data: ${dataBr}`,
                  `• Valor: ${leitura.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
                  ...(legenda ? [] : ["", "✍️ Quer dizer do que se trata? Responda em até 15 min (texto ou áudio), ex.: \"almoço com cliente Reserva da Mata\"."]),
                  "", "📌 Enviado para aprovação do Financeiro em Reembolsos. Se algo estiver errado, corrija lá antes da aprovação.",
                ].join("\n"));
                return ok({ agente: true, reembolso: true });
              }
              const tr = tipo === "audio" && midia ? await transcreverAgente(midia, { clientToken: String(col.instancia["client_token"] ?? col.instancia["security_token"] ?? "") || undefined, mimeType: body.audio?.mimeType, ia }) : { texto };
              const relato = tr.texto;
              if (!relato.trim()) { await responder(tipo === "audio" ? `Não consegui ouvir o áudio agora${tr.motivo ? ` (motivo: ${tr.motivo})` : ""}. Tente de novo ou envie em texto.` : "Não consegui entender a mensagem. Envie em texto ou um áudio mais claro."); return ok({ agente: true }); }
              // Complemento da última nota enviada sem legenda (até 15 min): vira a observação do reembolso.
              {
                const { data: obs, error: eO } = await db.rpc("crm_agente_reembolso_obs" as never, { p_token: k, p_telefone: body.phone, p_texto: relato.trim() } as never);
                if (eO && !/function|schema cache/i.test(eO.message)) console.error("zapi-webhook reembolso obs", eO.message);
                const o = obs as { id?: string; valor?: number } | null;
                if (o?.id) { await responder(`✍️ Descrição adicionada ao reembolso${o.valor ? ` de ${Number(o.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}: "${relato.trim().slice(0, 300)}"`); return ok({ agente: true, reembolso_obs: true }); }
              }
              const { data: eqRaw } = await db.rpc("crm_agente_equipe" as never, { p_token: k, p_telefone: body.phone } as never);
              const acao = await interpretarAgente(relato, ia, Array.isArray(eqRaw) ? (eqRaw as string[]) : []);
              if (!acao) { await responder("Não identifiquei o cliente nem o colega. Ex.: \"Visitei o Condomínio Aurora, síndico pediu proposta para sexta\"."); return ok({ agente: true }); }
              const { data: rx, error: eX } = await db.rpc("crm_agente_executar" as never, { p_token: k, p_telefone: body.phone, p_dados: acao } as never);
              if (eX) throw eX;
              const r0 = rx as { cliente: string | null; titulo?: string | null; equipe?: string[]; equipe_emails?: string[]; novo: boolean; reuniao_id?: string | null; sala?: string | null; inicio?: string | null; presencial?: boolean; emails?: string[]; telefones?: string[] };
              const fmt = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
              const interna = !r0.cliente;
              const eq = r0.equipe ?? [];
              const linhas = interna ? [`✅ Reunião com a equipe (${eq.join(", ")}) — nada foi cadastrado como cliente.`]
                : [`✅ Registrado no CRM de *${r0.cliente}*${r0.novo ? " (novo Lead cadastrado no Kanban — complete o CNPJ no Hub)" : ""}.`];
              if (!interna && eq.length) linhas.push(`👤 Equipe na agenda: ${eq.join(", ")}`);
              if (r0.reuniao_id && r0.inicio && r0.sala) {
                const emails = interna ? (r0.equipe_emails ?? []) : r0.emails ?? [], fones = interna ? [] : r0.telefones ?? [];
                const pend: Pend = { id: r0.reuniao_id, titulo: r0.titulo ?? `${r0.presencial ? "Visita" : "Reunião online"}: ${r0.cliente}`, inicio: r0.inicio, sala: r0.sala, video: true, modalidade: r0.presencial ? "presencial" : "online", local: r0.presencial ? r0.cliente : null, duracao_min: 60,
                  convidados: [...emails.map((e, i) => ({ email: e, telefone: i === 0 ? fones[0] ?? "" : "" })), ...(emails.length ? [] : fones.slice(0, 1).map((f) => ({ email: "", telefone: f })))] };
                linhas.push(`📅 *${interna ? "Reunião interna" : r0.presencial ? "Visita" : "Reunião online"} agendada no Planner*: ${fmt(r0.inicio)} (60 min)${interna ? " — já está na agenda dos colegas" : ""}`);
                if (acao.convidados_nome) linhas.push(`👥 Convidados: ${acao.convidados_nome}`);
                if (!r0.presencial) linhas.push(`🔗 Sala: ${linkSala(r0.sala)}`);
                if (acao.enviar_convite) linhas.push(await enviarConvite(pend, acao.enviar_convite));
                else linhas.push("", interna ? "Quer enviar também o convite com o link?" : "Quer enviar o convite ao cliente?", `1️⃣ Por e-mail${emails[0] ? ` (${emails.join(", ")})` : ""}`, `2️⃣ Por WhatsApp${fones[0] ? ` (${fones[0]})` : " (te mando o texto para repassar)"}`, "3️⃣ Não enviar agora");
              } else if (acao.proxima_acao_em) {
                linhas.push(`📌 Próxima ação: ${acao.proxima_acao_tipo ?? "Retorno"} em ${fmt(acao.proxima_acao_em)}`);
              }
              await responder(linhas.join("\n"));
            } catch (e) {
              console.error("zapi-webhook agente", e);
              await responder("Não consegui registrar agora. Tente novamente em instantes.");
            }
            return ok({ agente: true });
          }
        }

        // Linha exclusiva de notificações: respostas (ex.: auto-resposta de fornecedor) não abrem atendimento nem robô.
        const { data: fin } = await db.rpc("instancia_finalidade", { p_token: k });
        if (String(fin ?? "") === "notificacoes") return ok({ ignorada: true, motivo: "notificacoes" });

        // Resposta à pesquisa de satisfação: grava a nota no atendimento encerrado, agradece e NÃO abre novo atendimento.
        const notaCsat = tipo === "texto" ? (lr?.selectedRowId && /^[0-5]$/.test(texto) && /⭐/.test(String(lr.title ?? "")) ? notaDaLinha(texto) : detectarNota(texto)) : null;
        if (notaCsat !== null) {
          const { data: av, error: eAv } = await db.rpc("csat_webhook_avaliar_suporte" as never, {
            p_token: k, p_telefone: body.phone, p_nota: notaCsat, p_texto: lr?.title || texto, p_externo: body.messageId ?? null,
          } as never);
          if (eAv && !/function|schema cache/i.test(eAv.message)) console.error("zapi-webhook csat", eAv.message);
          const a = av as { avaliado?: boolean; duplicada?: boolean; atendimento_id?: string; telefone?: string; mensagem?: string; mensagem_id?: string; instancia?: Record<string, unknown> } | null;
          if (a?.avaliado) {
            if (!a.duplicada && a.mensagem && a.instancia) {
              try {
                await dispararMensagem({ instancia: a.instancia, mensagemId: a.mensagem_id, atendimentoId: a.atendimento_id, telefone: a.telefone ?? body.phone, texto: a.mensagem });
              } catch (e) { console.error("zapi-webhook csat envio", e); }
            }
            return ok({ avaliacao: notaCsat });
          }
          // Resposta da pesquisa (lista de estrelas ou texto com ⭐): nunca reinicia o robô nem reabre atendimento.
          if (/⭐/.test(String(lr?.title ?? "")) || /⭐/.test(texto)) {
            // Mesmo sem achar o chamado, agradece para o cliente não ficar sem resposta.
            if (a?.mensagem && a.instancia) {
              try { await dispararMensagem({ instancia: a.instancia, telefone: a.telefone ?? body.phone, texto: a.mensagem, mensagemId: null, atendimentoId: null }); }
              catch (e) { console.error("zapi-webhook csat envio", e); }
            }
            return ok({ avaliacao: notaCsat, registrada: false });
          }
        }

        // Cortesia logo após o encerramento ("igualmente", "obrigado"): registra no chamado encerrado, sem abrir outro nem acionar o robô.
        if (tipo === "texto" && ehCortesia(texto)) {
          const { data: cz, error: eC } = await db.rpc("atendimento_cortesia_pos_encerramento" as never, {
            p_token: k, p_telefone: body.phone, p_texto: texto, p_externo: body.messageId ?? null,
          } as never);
          if (eC && !/function|schema cache/i.test(eC.message)) console.error("zapi-webhook cortesia", eC.message);
          if (cz === true) return ok({ cortesia: true });
        }

        const { data, error } = await db.rpc("fluxo_webhook_receber", {
          p_token: k, p_telefone: body.phone, p_nome: body.senderName || body.chatName || "",
          p_texto: texto, p_tipo: tipo, p_midia: midia, p_externo: body.messageId ?? null,
        });
        if (error) {
          console.error("zapi-webhook receber", error.message);
          return new Response("Erro ao registrar", { status: 500 });
        }
        const r = data as Recebido;
        // Lead do SDR respondeu: encerra a sequência e marca como Qualificado (ignora se o banco não tiver a função).
        if (!r.interno) {
          const { error: eS } = await db.rpc("sdr_lead_respondeu" as never, { p_token: k, p_telefone: body.phone } as never);
          if (eS && !/function|schema cache/i.test(eS.message)) console.error("zapi-webhook sdr", eS.message);
        }
        // Foto do contato enviada pela Z-API (atualiza o cadastro; ignora se o banco não tiver a função).
        const raw = body as Record<string, unknown>;
        const foto = [raw["senderPhoto"], raw["photo"], raw["photoUrl"]].find((v) => typeof v === "string" && /^https?:\/\//.test(v)) as string | undefined;
        if (foto && r.atendimento_id && !r.interno) {
          const { error: eF } = await db.rpc("fluxo_webhook_foto", { p_token: k, p_atendimento: r.atendimento_id, p_foto: foto });
          if (eF) console.error("zapi-webhook foto", eF.message);
        }
        if (r.duplicada || r.interno || !r.fluxo) return ok();
        // Auto-resposta comercial (ex.: fornecedor) em conversa nova: registra, mas não aciona o robô.
        if (!r.execucao && tipo === "texto" && ehRespostaAutomatica(texto)) return ok({ robo: false, motivo: "auto_resposta" });

        const acao = async (nome: string, dados: Record<string, unknown>) => {
          const resposta = nome === "fila" || (nome === "modo" && dados["modo"] === "Humano")
          ? await db.rpc("fluxo_webhook_fila" as never, { p_token: k, p_atendimento: r.atendimento_id, p_dados: dados } as never)
          : nome === "campos"
          ? await db.rpc("fluxo_webhook_campos" as never, { p_token: k, p_atendimento: r.atendimento_id, p_campos: dados["campos"] } as never)
          : nome === "encerrar"
          ? db.rpc("atendimento_webhook_encerrar" as never, { p_token: k, p_atendimento: r.atendimento_id } as never)
          : db.rpc("fluxo_webhook_acao", { p_token: k, p_atendimento: r.atendimento_id, p_acao: nome, p_dados: dados });
          const resultado = await resposta;
          if (resultado.error) throw resultado.error;
          if ((resultado.data as { ok?: boolean } | null)?.ok === false) throw new Error(`Ação ${nome} não aplicada`);
          return resultado;
        };

        // Comandos globais (#atendente, #sair; #inicio reinicia abaixo): valem em qualquer etapa.
        const cfgCmd = (r.fluxo.nos ?? []).find((n) => (n.data?.tipo ?? n.type) === "gatilho")?.data ?? {};
        const comando = tipo === "texto" ? detectarComando(texto, cfgCmd) : null;
        if (comando === "atendente" || comando === "sair") {
          const txt = mensagemComando(comando, cfgCmd);
          const { data: m } = await acao("mensagem", { texto: txt });
          const mid = (m as { id?: string } | null)?.id;
          try {
            await dispararMensagem({ instancia: r.instancia, mensagemId: mid, atendimentoId: r.atendimento_id, telefone: r.telefone, texto: txt });
            if (mid) await acao("status_envio", { id: mid, status: "enviado" });
          } catch (e) {
            console.error("zapi-webhook comando", e);
            if (mid) await acao("status_envio", { id: mid, status: "falha" });
          }
          if (comando === "atendente") {
            const etapa = String(cfgCmd["atendente_etapa_id"] ?? "");
            await acao("fila", { etapa_id: etapa, quadro_id: String(cfgCmd["atendente_quadro_id"] ?? "") });
          } else {
            await acao("encerrar", {});
          }
          await acao("execucao", { id: r.execucao?.id ?? null, fluxo_id: r.fluxo.id, no_atual: null, status: comando === "atendente" ? "transbordo" : "finalizado", variaveis: r.execucao?.variaveis ?? {} });
          return ok({ comando });
        }
        if (comando === "inicio" && r.execucao) r.execucao = { ...r.execucao, no_atual: null, status: "ativo" };


        // Atalho "#tag": entra no fluxo pelo bloco "Mover no Kanban" da tag (pula o menu inicial).
        // Sem bloco correspondente no fluxo, apenas move para o Kanban e passa para humano.
        // Vale também com conversa em andamento: a #tag é intenção explícita do cliente.
        const tag = tipo === "texto" ? extrairTagAcesso(texto) : null;
        let entradaAtalho: string | null = null;
        if (tag) {
          const { data: etapaId } = await db.rpc("fluxo_webhook_rota", { p_token: k, p_tag: tag });
          entradaAtalho = noDoAtalho(r.fluxo.nos ?? [], tag, etapaId ? String(etapaId) : null);
          if (!entradaAtalho) {
            // Atalho personalizado em outro fluxo da empresa (ex.: #comercial no fluxo da Oferta).
            const { data: todos, error: eT } = await db.rpc("fluxo_webhook_fluxos" as never, { p_token: k } as never);
            if (eT && !/function|schema cache/i.test(eT.message)) console.error("zapi-webhook atalhos", eT.message);
            for (const f of ((todos ?? []) as Array<NonNullable<Recebido["fluxo"]> & { ativo?: boolean | null }>)) {
              if (f.ativo === false) continue;
              const no = noDoAtalho((f.nos ?? []).filter((n) => (n.data?.tipo ?? n.type) === "kanban" && String(n.data?.["atalho"] ?? "")), tag, null);
              if (no) { r.fluxo = { id: f.id, nos: f.nos, conexoes: f.conexoes }; entradaAtalho = no; break; }
            }
          }
          if (entradaAtalho) r.execucao = r.execucao ? { ...r.execucao, no_atual: null, status: "ativo" } : null;
          if (!entradaAtalho && etapaId) {
            await acao("fila", { etapa_id: etapaId });
            return ok({ robo: false, motivo: "atalho_kanban", tag });
          }
        }

        const textoMotor = tipo === "texto" ? texto : texto || tipo;
        let fluxoAtual = r.fluxo;
        // Dados do contato sempre disponíveis no fluxo: {{telefone}}, {{nome}}, {{protocolo}}.
        const contato = {
          protocolo: r.protocolo ?? "",
          telefone: String(r.telefone || body.phone || "").replace(/\D/g, ""),
          nome: body.senderName || body.chatName || "",
        };
        const estadoIni = entradaAtalho
          ? { ...(r.execucao ?? {}), no_atual: entradaAtalho, status: "ativo" as const, variaveis: { ...(r.execucao?.variaveis ?? {}), ...contato, atalho: tag ?? "" } }
          : r.execucao
          ? { ...r.execucao, variaveis: { ...contato, ...(r.execucao.variaveis ?? {}), protocolo: contato.protocolo, telefone: contato.telefone } }
          : { no_atual: entradaAtalho, status: "ativo" as const, variaveis: tag ? { ...contato, atalho: tag } : contato };
        const executarSeguro = (p: Parameters<typeof executarFluxo>[0]): ReturnType<typeof executarFluxo> => {
          try { return executarFluxo(p); }
          catch (e) {
            console.error("zapi-webhook motor", e);
            return { acoes: [{ tipo: "modo", modo: "Humano" }], estado: { no_atual: null, status: "transbordo", variaveis: { ...contato } } };
          }
        };
        let res = executarSeguro({ nos: fluxoAtual.nos ?? [], conexoes: fluxoAtual.conexoes ?? [], estado: estadoIni, texto: textoMotor });
        const acoes = [...res.acoes];
        // Blocos externos (HTTP/JavaScript) e "Executar outro fluxo" (limite evita laço).
        for (let passos = 0; (res.subfluxo || res.externo) && passos < 20; passos++) {
          if (res.externo) {
            const no = res.externo.no;
            const ext = await executarExterno(no, res.estado.variaveis);
            if (ext.erro) console.error("zapi-webhook bloco", no.id, ext.erro);
            if (ext.mensagem) acoes.push({ tipo: "mensagem", texto: ext.mensagem });
            for (const c of ext.campos ?? []) acoes.push({ tipo: "campo", chave: c.chave, valor: c.valor });
            const prox = proximoNoId(fluxoAtual.conexoes ?? [], no.id, ext.saida);
            if (!prox) {
              // IA respondeu e não há próximo bloco: aguarda a próxima pergunta no mesmo bloco.
              const continua = (no.data?.tipo ?? no.type) === "ia" && ext.saida === "respondeu";
              res = { acoes: [], estado: { no_atual: continua ? no.id : null, status: continua ? "aguardando" : "finalizado", variaveis: ext.variaveis } };
              break;
            }
            res = executarSeguro({
              nos: fluxoAtual.nos ?? [], conexoes: fluxoAtual.conexoes ?? [],
              estado: { no_atual: prox, status: "ativo", variaveis: ext.variaveis }, texto: textoMotor,
            });
            acoes.push(...res.acoes);
            continue;
          }
          const { data: sub } = await db.rpc("fluxo_webhook_subfluxo", { p_token: k, p_fluxo: res.subfluxo });
          const f = sub as Recebido["fluxo"];
          if (!f) break;
          fluxoAtual = f;
          res = executarSeguro({
            nos: f.nos ?? [], conexoes: f.conexoes ?? [],
            estado: { no_atual: null, status: "ativo", variaveis: res.estado.variaveis }, texto: textoMotor,
          });
          acoes.push(...res.acoes);
        }
        const estado = res.estado;

        // Fluxo começando agora: a conversa passa a ser do robô até um transbordo.
        if (!r.execucao) await acao("modo", { modo: "IA" });

        for (const a of agruparCampos(acoes)) {
          try {
            if (a.tipo === "mensagem") {
              if (!a.texto.trim() && a.lista?.opcoes?.length) a.texto = a.lista.titulo || "Escolha uma opção:";
              if (!a.texto.trim() && !a.midiaUrl) continue;
              const { data: m } = await acao("mensagem", { texto: (a.lista ? [a.texto, ...a.lista.opcoes.map((o, i) => `${i + 1}. ${o}`)].filter(Boolean).join("\n") : a.texto) || a.nomeArquivo || a.midiaTipo || "", ...(a.midiaUrl ? { midia_url: a.midiaUrl, tipo: a.midiaTipo } : {}) });
              const mid = (m as { id?: string } | null)?.id;
              try {
                const zid = await dispararMensagem({ instancia: r.instancia, mensagemId: mid, atendimentoId: r.atendimento_id, telefone: r.telefone, texto: a.texto, midiaUrl: a.midiaUrl, tipo: a.midiaTipo, nomeArquivo: a.nomeArquivo, lista: a.lista });
                if (mid) await acao("status_envio", { id: mid, status: "enviado" });
                if (mid && typeof zid === "string") {
                  const { error: eV } = await db.rpc("zapi_webhook_vincular" as never, { p_token: k, p_mensagem: mid, p_zapi: zid } as never);
                  if (eV && !/function|schema cache/i.test(eV.message)) console.error("zapi-webhook vincular", eV.message);
                }
              } catch (e) {
                console.error("zapi-webhook envio", e);
                if (mid) await acao("status_envio", { id: mid, status: "falha" });
              }
            } else if (a.tipo === "atraso") {
              await new Promise((res) => setTimeout(res, a.segundos * 1000));
            } else if (a.tipo === "etapa") {
              await acao("etapa", { etapa_id: a.etapa_id, prioridade: a.prioridade ?? null });
            } else if (a.tipo === "fila") {
              await acao("fila", { quadro_id: a.quadro_id, etapa_id: a.etapa_id, prioridade: a.prioridade });
            } else if (a.tipo === "modo") {
              await acao("modo", { modo: a.modo });
            } else if (a.tipo === "campo") {
              await acao("campo", { chave: a.chave, valor: a.valor });
            } else if (a.tipo === "campos") {
              await acao("campos", { campos: a.campos });
            } else if (a.tipo === "encerrar") {
              await acao("encerrar", {});
            }
          } catch (e) {
            console.error("zapi-webhook ação", a.tipo, e);
            // Não marque como concluído um fluxo cuja gravação/transferência falhou.
            return new Response("Erro ao aplicar ação do atendimento", { status: 500 });
          }
        }

        if (fluxoAtual.id !== r.fluxo.id) {
          // Encerra a execução anterior e abre uma nova no fluxo para onde a conversa foi.
          if (r.execucao?.id) await acao("execucao", { id: r.execucao.id, no_atual: null, status: "finalizado", variaveis: estado.variaveis });
          await acao("execucao", { id: null, fluxo_id: fluxoAtual.id, ...estado });
        } else {
          await acao("execucao", { id: r.execucao?.id ?? null, fluxo_id: r.fluxo.id, ...estado });
        }
        return ok({ acoes: acoes.length });
      },
    },
  },
});
