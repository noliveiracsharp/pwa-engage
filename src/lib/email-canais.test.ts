import { describe, expect, it } from "vitest";
import { canalSugerido, type CanalEmail } from "./email-canais";

const c = (id: string, finalidades: string[], extra: Partial<CanalEmail> = {}): CanalEmail => ({
  id, empresa_id: "e", nome: id, finalidades, padrao: false, ativo: true, email_modo: "proprio",
  smtp_host: null, smtp_porta: 465, smtp_usuario: null, remetente_nome: null, remetente_email: null, responder_para: null, ...extra,
});

describe("canalSugerido", () => {
  it("usa o canal comercial para Ofertas", () => {
    expect(canalSugerido([c("noreply", ["sistema"], { padrao: true }), c("comercial", ["comercial"])], "comercial")?.id).toBe("comercial");
  });
  it("cai no canal padrão quando nenhum atende a finalidade", () => {
    expect(canalSugerido([c("comercial", ["comercial"]), c("noreply", ["sistema"], { padrao: true })], "compras")?.id).toBe("noreply");
  });
  it("ignora canais inativos", () => {
    expect(canalSugerido([c("compras", ["compras"], { ativo: false }), c("noreply", ["sistema"])], "compras")?.id).toBe("noreply");
  });
});
