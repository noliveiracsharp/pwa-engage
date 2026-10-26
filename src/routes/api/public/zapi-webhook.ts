import { createFileRoute } from "@tanstack/react-router";
import { ehRespostaAutomatica } from "@/lib/instancia-finalidade";
import { ehDiretoComercial } from "@/lib/qr-direto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { dispararMensagem } from "@/lib/atendimentos-envio";
import { executarExterno } from "@/lib/fluxos-externo";
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
        // Só mensagens recebidas de contatos (ignora status, grupos e as enviadas por nós).
        if (body.fromMe || body.isGroup || !body.phone) return ok({ ignorada: true });
        // Ignora só avisos de status/entrega; qualquer outro "type" (chat, text, audio...) é mensagem.
        const tipoEvt = String(body.type ?? "").toLowerCase();
        if (/status|delivery|presence|connected|disconnected/.test(tipoEvt)) return ok({ ignorada: true });

        let texto = body.text?.message ?? "";
        let tipo = "texto";
        let midia: string | null = null;
        if (body.image?.imageUrl) { tipo = "imagem"; midia = body.image.imageUrl; texto = body.image.caption ?? ""; }
        else if (body.audio?.audioUrl) { tipo = "audio"; midia = body.audio.audioUrl; }
        else if (body.video?.videoUrl) { tipo = "video"; midia = body.video.videoUrl; texto = body.video.caption ?? ""; }
        else if (body.document?.documentUrl) { tipo = "documento"; midia = body.document.documentUrl; texto = body.document.fileName ?? ""; }

        const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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

        // Linha exclusiva de notificações: respostas (ex.: auto-resposta de fornecedor) não abrem atendimento nem robô.
        const { data: fin } = await db.rpc("instancia_finalidade", { p_token: k });
        if (String(fin ?? "") === "notificacoes") return ok({ ignorada: true, motivo: "notificacoes" });

        const { data, error } = await db.rpc("fluxo_webhook_receber", {
          p_token: k, p_telefone: body.phone, p_nome: body.senderName || body.chatName || "",
          p_texto: texto, p_tipo: tipo, p_midia: midia, p_externo: body.messageId ?? null,
        });
        if (error) {
          console.error("zapi-webhook receber", error.message);
          return new Response("Erro ao registrar", { status: 500 });
        }
        const r = data as Recebido;
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

        // QR Code "direto para o Comercial": pula o robô e entrega a conversa para a equipe.
        if (!r.execucao && ehDiretoComercial(texto)) {
          await acao("modo", { modo: "Humano" });
          return ok({ robo: false, motivo: "direto_comercial" });
        }

        const textoMotor = tipo === "texto" ? texto : texto || tipo;
        let fluxoAtual = r.fluxo;
        const estadoIni = r.execucao
          ? { ...r.execucao, variaveis: { ...(r.execucao.variaveis ?? {}), protocolo: r.protocolo ?? "" } }
          : { no_atual: null, status: "ativo" as const, variaveis: { protocolo: r.protocolo ?? "" } };
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
              if (!a.texto.trim()) continue;
              const { data: m } = await acao("mensagem", { texto: a.texto });
              const mid = (m as { id?: string } | null)?.id;
              try {
                await dispararMensagem({ instancia: r.instancia, mensagemId: mid, atendimentoId: r.atendimento_id, telefone: r.telefone, texto: a.texto });
                if (mid) await acao("status_envio", { id: mid, status: "enviado" });
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
