import { createFileRoute } from "@tanstack/react-router";
import { enviarPushPendentes } from "@/lib/push-envio.server";

/** Esvazia a fila de notificações. Não recebe dados: só dispara o envio do que o banco já enfileirou. */
export const Route = createFileRoute("/api/public/push-enviar")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async () => {
        const r = await enviarPushPendentes();
        return Response.json({ ok: !r.erro, enviados: r.enviados }, { status: r.erro === "não configurado" ? 503 : 200 });
      },
    },
  },
});
