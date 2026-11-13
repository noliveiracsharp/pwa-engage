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
import { executarFluxo, proximoNoId, type ConexaoFluxo, type EstadoExec, type NoFluxo } from "@/lib/fluxos-motor";

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
    audio: z.object({ audioUrl: z.string().optional() }).partial().optional().nullable(),
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
      GET: async () => ok({ info: "Endereço de recebimento do Atende.ai" }),
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
        if (body.image?.imageUrl) { tipo = "imagem"; midia = body.image.imageUrl; texto = body.image.caption ?? ""; }
        else if (body.audio?.audioUrl) { tipo = "audio"; midia = body.audio.audioUrl; }
        else if (body.video?.videoUrl) { tipo = "video"; midia = body.video.videoUrl; texto = body.video.caption ?? ""; }
        else if (body.document?.documentUrl) { tipo = "documento"; midia = body.document.documentUrl; texto = body.document.fileName ?? ""; }

        // Linha exclusiva de notificações: respostas (ex.: auto-resposta de fornecedor) não abrem atendimento nem robô.
        const { data: fin } = await db.rpc("instancia_finalidade", { p_token: k });
        if (String(fin ?? "") === "notificacoes") return ok({ ignorada: true, motivo: "notificacoes" });

        // Resposta à pesquisa de satisfação: grava a nota no atendimento encerrado, agradece e NÃO abre novo atendimento.
        const notaCsat = tipo === "texto" ? (lr?.selectedRowId && /^[0-5]$/.test(texto) && /⭐/.test(String(lr.title ?? "")) ? notaDaLinha(texto) : detectarNota(texto)) : null;
        if (notaCsat !== null) {
          const { data: av, error: eAv } = await db.rpc("csat_webhook_avaliar" as never, {
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

        const acao = (nome: string, dados: Record<string, unknown>) =>
          db.rpc("fluxo_webhook_acao", { p_token: k, p_atendimento: r.atendimento_id, p_acao: nome, p_dados: dados });

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
            if (etapa) await acao("etapa", { etapa_id: etapa });
            await acao("modo", { modo: "Humano" });
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
            await acao("etapa", { etapa_id: etapaId });
            await acao("modo", { modo: "Humano" });
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
        let res = executarFluxo({ nos: fluxoAtual.nos ?? [], conexoes: fluxoAtual.conexoes ?? [], estado: estadoIni, texto: textoMotor });
        const acoes = [...res.acoes];
        // Blocos externos (HTTP/JavaScript) e "Executar outro fluxo" (limite evita laço).
        for (let passos = 0; (res.subfluxo || res.externo) && passos < 20; passos++) {
          if (res.externo) {
            const no = res.externo.no;
            const ext = await executarExterno(no, res.estado.variaveis);
            if (ext.erro) console.error("zapi-webhook bloco", no.id, ext.erro);
            if (ext.mensagem) acoes.push({ tipo: "mensagem", texto: ext.mensagem });
            const prox = proximoNoId(fluxoAtual.conexoes ?? [], no.id, ext.saida);
            if (!prox) {
              // IA respondeu e não há próximo bloco: aguarda a próxima pergunta no mesmo bloco.
              const continua = (no.data?.tipo ?? no.type) === "ia" && ext.saida === "respondeu";
              res = { acoes: [], estado: { no_atual: continua ? no.id : null, status: continua ? "aguardando" : "finalizado", variaveis: ext.variaveis } };
              break;
            }
            res = executarFluxo({
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
          res = executarFluxo({
            nos: f.nos ?? [], conexoes: f.conexoes ?? [],
            estado: { no_atual: null, status: "ativo", variaveis: res.estado.variaveis }, texto: textoMotor,
          });
          acoes.push(...res.acoes);
        }
        const estado = res.estado;

        // Fluxo começando agora: a conversa passa a ser do robô até um transbordo.
        if (!r.execucao) await acao("modo", { modo: "IA" });

        for (const a of acoes) {
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
            } else if (a.tipo === "modo") {
              await acao("modo", { modo: a.modo });
            } else if (a.tipo === "campo") {
              await acao("campo", { chave: a.chave, valor: a.valor });
            } else if (a.tipo === "encerrar") {
              await acao("encerrar", {});
            }
          } catch (e) {
            console.error("zapi-webhook ação", a.tipo, e);
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
