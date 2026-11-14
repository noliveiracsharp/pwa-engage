import { supabase } from "@/integrations/supabase/client";
import { rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

const digitos = (v: unknown) => text(v).replace(/\D/g, "");

/** Só dígitos; adiciona 55 quando vier apenas DDD + número (10 ou 11 dígitos). */
export function sanitizarTelefone(v: unknown): string {
  const phone = digitos(v);
  return phone.length === 10 || phone.length === 11 ? `55${phone}` : phone;
}

/** Tira o último link do texto (para virar botão) e limpa rótulos soltos como "Revise e aprove:". */
export function separarLink(texto: string): { mensagem: string; url: string | null } {
  const achados = texto.match(/https?:\/\/[^\s<>"']+/g);
  if (!achados?.length) return { mensagem: texto, url: null };
  const url = achados[achados.length - 1]!;
  const i = texto.lastIndexOf(url);
  const mensagem = (texto.slice(0, i) + texto.slice(i + url.length))
    .replace(/[ \t]*[^\n.!?]*:[ \t]*$/m, (m) => (m.trim().endsWith(":") ? "" : m))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { mensagem: mensagem || "Toque no botão abaixo.", url };
}

type Envio = {
  instancia: Row | undefined;
  mensagemId: unknown;
  atendimentoId: unknown;
  telefone: string;
  texto: string;
  midiaUrl?: string | undefined;
  tipo?: string | undefined;
  nomeArquivo?: string | undefined;
  /** ID da mensagem no WhatsApp que está sendo respondida (citação nativa). */
  responderA?: string | null | undefined;
  /** Lista interativa do WhatsApp (send-option-list); se recusada, vai como texto numerado. */
  lista?: { titulo: string; botao: string; opcoes: string[] } | undefined;
};

/** ID da mensagem devolvido pela Z-API (usado para confirmações de entrega/leitura). */
async function idZapi(r: Response): Promise<string | null> {
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  const v = j?.["messageId"] ?? j?.["id"] ?? j?.["zaapId"];
  return typeof v === "string" && v ? v : null;
}

/** Dispara a mensagem conforme o tipo_envio da instância. Retorna o ID da Z-API (ou true) se enviou. */
export async function dispararMensagem(e: Envio): Promise<string | true> {
  const inst = e.instancia;
  if (!inst) throw new Error("Instância não encontrada.");
  // Chat do site: a mensagem já está gravada e o widget a lê do banco.
  if (text(pick(inst, ["tipo"])) === "chat") return true;
  const tipoEnvio = text(pick(inst, ["tipo_envio"])) || "zapi_direto";
  const phone = sanitizarTelefone(e.telefone);
  if (!phone) throw new Error("Contato sem telefone.");

  if (tipoEnvio === "n8n_webhook") {
    const url = text(pick(inst, ["n8n_webhook_url"]));
    if (!url) throw new Error("URL do webhook n8n não configurada.");
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem_id: e.mensagemId,
        atendimento_id: e.atendimentoId,
        telefone: phone,
        mensagem: e.texto,
        midia_url: e.midiaUrl ?? null,
        tipo: e.tipo ?? "texto",
        nome_arquivo: e.nomeArquivo ?? null,
        instancia: {
          id: rowId(inst),
          nome: pick(inst, ["nome"]),
          instance_id: pick(inst, ["instance_id"]),
          telefone: pick(inst, ["telefone", "numero"]),
        },
      }),
    });
    if (!r.ok) throw new Error(`Webhook respondeu ${r.status}`);
    return true;
  }

  const instanceId = text(pick(inst, ["instance_id"]));
  const token = text(pick(inst, ["token"]));
  if (!instanceId || !token) throw new Error("Instance ID ou token da Z-API não configurados.");
  const base = `https://api.z-api.io/instances/${instanceId}/token/${token}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const clientToken = text(pick(inst, ["client_token"]));
  if (clientToken) headers["Client-Token"] = clientToken;
  let endpoint = "send-text";
  let body: Row = { phone, message: e.texto };
  if (e.midiaUrl) {
    const t = e.tipo ?? "documento";
    if (t === "imagem") { endpoint = "send-image"; body = { phone, image: e.midiaUrl, caption: e.texto }; }
    else if (t === "audio") { endpoint = "send-audio"; body = { phone, audio: e.midiaUrl }; }
    else if (t === "video") { endpoint = "send-video"; body = { phone, video: e.midiaUrl, caption: e.texto }; }
    else {
      const ext = (e.nomeArquivo ?? e.midiaUrl).split(".").pop()?.split("?")[0] || "pdf";
      endpoint = `send-document/${ext}`; // a Z-API exige a extensão no caminho
      body = { phone, document: e.midiaUrl, ...(e.nomeArquivo ? { fileName: e.nomeArquivo } : {}), ...(e.texto?.trim() ? { caption: e.texto } : {}) };
    }
    if (e.responderA) body["messageId"] = e.responderA;
  } else if (e.lista?.opcoes.length) {
    const rl = await fetch(`${base}/send-option-list`, {
      method: "POST", headers,
      body: JSON.stringify({
        phone, message: e.texto || e.lista.titulo,
        optionList: {
          title: e.lista.titulo, buttonLabel: e.lista.botao,
          options: e.lista.opcoes.slice(0, 10).map((o, i) => ({ id: String(i + 1), title: o.slice(0, 24), description: o.length > 24 ? o.slice(24, 96) : "" })),
        },
      }),
    }).catch(() => null);
    if (rl?.ok) return (await idZapi(rl)) ?? true;
    body = { phone, message: [e.texto, ...e.lista.opcoes.map((o, i) => `${i + 1}. ${o}`)].filter(Boolean).join("\n") };
  } else if (e.responderA) {
    // Resposta citando: texto simples para manter a citação nativa no WhatsApp.
    body = { phone, message: e.texto, messageId: e.responderA };
  } else {
    // Link vira botão "Acesse" (URL escondida); se o WhatsApp recusar botões, cai no texto com o link em linha própria.
    const { mensagem, url } = separarLink(e.texto);
    if (url) {
      const rb = await fetch(`${base}/send-button-actions`, {
        method: "POST", headers,
        body: JSON.stringify({ phone, message: mensagem, buttonActions: [{ id: "1", type: "URL", url, label: "Acesse" }] }),
      }).catch(() => null);
      if (rb?.ok) return (await idZapi(rb)) ?? true;
      body = { phone, message: `${mensagem}\n\n${url}` };
    }
  }
  const r = await fetch(`${base}/${endpoint}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw new Error(`Z-API respondeu ${r.status}${detalhe ? `: ${detalhe.slice(0, 200)}` : ""}`);
  }
  return (await idZapi(r)) ?? true;
}

/** Edita no WhatsApp uma mensagem de texto já enviada (Z-API send-text com editMessageId). */
export async function editarMensagemZapi(inst: Row | undefined, telefone: string, messageId: string, novoTexto: string) {
  if (!inst || text(pick(inst, ["tipo"])) === "chat") return true;
  const instanceId = text(pick(inst, ["instance_id"]));
  const token = text(pick(inst, ["token"]));
  if (!instanceId || !token) throw new Error("Instance ID ou token da Z-API não configurados.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const clientToken = text(pick(inst, ["client_token"]));
  if (clientToken) headers["Client-Token"] = clientToken;
  const r = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
    method: "POST", headers, body: JSON.stringify({ phone: sanitizarTelefone(telefone), message: novoTexto, editMessageId: messageId }),
  });
  if (!r.ok) throw new Error(`Z-API respondeu ${r.status}`);
  return true;
}

/** Atualiza status_envio da mensagem e guarda o ID da Z-API para receber entregue/lido. */
export async function marcarEnvio(mensagemId: unknown, status: "enviado" | "falha", idWhatsApp?: string | true | null) {
  if (mensagemId == null) return;
  const dados: Record<string, unknown> = { status_envio: status };
  if (typeof idWhatsApp === "string") dados["message_id_zapi"] = idWhatsApp;
  const { error } = await supabase.from("atendimentos_mensagem").update(dados as never).eq("id", mensagemId as never);
  // Banco sem a coluna message_id_zapi: grava só o status.
  if (error && "message_id_zapi" in dados) {
    await supabase.from("atendimentos_mensagem").update({ status_envio: status } as never).eq("id", mensagemId as never);
  }
}
