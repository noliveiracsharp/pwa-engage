import { describe, expect, it } from "vitest";
import { escolhaConvite, lerAcaoAgente } from "./crm-agente";

describe("lerAcaoAgente", () => {
  it("visita agendada vira tipo visita com data", () => {
    const a = lerAcaoAgente('```json\n{"cliente":"Cond. Aurora","tipo":"nota","resumo":"Agendei visita","visita_em":"2026-12-01T10:00:00-03:00","tecnico":"João"}\n```');
    expect(a?.tipo).toBe("visita");
    expect(a?.visita_em).toBe("2026-12-01T13:00:00.000Z");
    expect(a?.tecnico).toBe("João");
  });
  it("sem cliente citado não executa nada", () => {
    expect(lerAcaoAgente('{"cliente":"","resumo":""}')).toBeNull();
  });
  it("tipo desconhecido vira nota", () => {
    expect(lerAcaoAgente('{"cliente":"X","tipo":"fax","resumo":"r"}')?.tipo).toBe("nota");
  });
});

describe("convite pelo Agente", () => {
  it("lê pedido explícito de envio e e-mails do relato", () => {
    const a = lerAcaoAgente('{"cliente":"Reserva da Mata","tipo":"reuniao","resumo":"r","proxima_acao_em":"2026-11-26T10:00:00-03:00","convidados_email":["Gerente@ReservaDaMata.com","x"],"enviar_convite":"email"}');
    expect(a?.enviar_convite).toBe("email");
    expect(a?.convidados_email).toEqual(["gerente@reservadamata.com"]);
  });
  it("sem pedido explícito, enviar_convite fica null (Agente pergunta)", () => {
    expect(lerAcaoAgente('{"cliente":"X","resumo":"r","enviar_convite":"fax"}')?.enviar_convite).toBeNull();
  });
  it("entende as respostas 1, 2 e 3 do menu", () => {
    expect(escolhaConvite("1")).toBe("email");
    expect(escolhaConvite("manda por e-mail")).toBe("email");
    expect(escolhaConvite("2")).toBe("whatsapp");
    expect(escolhaConvite("pelo whatsapp")).toBe("whatsapp");
    expect(escolhaConvite("3")).toBe("nao");
    expect(escolhaConvite("não precisa")).toBe("nao");
    expect(escolhaConvite("Visitei o Condomínio Aurora hoje")).toBeNull();
  });
});
