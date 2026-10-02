import { supabase } from "@/integrations/supabase/client";
import { rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

const digitos = (v: unknown) => text(v).replace(/\D/g, "");

type Envio = {
  instancia: Row | undefined;
  mensagemId: unknown;
  atendimentoId: unknown;
  telefone: string;
  texto: string;
  midiaUrl?: string;
  tipo?: string;
  nomeArquivo?: string;
};

/** Dispara a mensagem conforme o tipo_envio da instância. Retorna true se enviou. */
export async function dispararMensagem(e: Envio): Promise<boolean> {
  const inst = e.instancia;
  if (!inst) throw new Error("Instância não encontrada.");
  const tipoEnvio = text(pick(inst, ["tipo_envio"])) || "zapi_direto";
  const phone = digitos(e.telefone);

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

  const base = text(pick(inst, ["url", "url_api", "endpoint"])).replace(/\/$/, "");
  if (!base) throw new Error("URL da Z-API não configurada.");
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
      endpoint = `send-document/${ext}`;
      body = { phone, document: e.midiaUrl, fileName: e.nomeArquivo };
    }
  }
  const r = await fetch(`${base}/${endpoint}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Z-API respondeu ${r.status}`);
  return true;
}

/** Atualiza status_envio da mensagem (ignora se a coluna não existir). */
export async function marcarEnvio(mensagemId: unknown, status: "enviado" | "erro") {
  if (mensagemId == null) return;
  await supabase.from("atendimentos_mensagem").update({ status_envio: status } as never).eq("id", mensagemId as never);
}
