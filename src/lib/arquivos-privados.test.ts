import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { caminhoPrivado, ehPrivado, montarCaminho } from "./arquivos-privados";

describe("arquivos privados", () => {
  it("arquivo fica dentro da pasta da empresa", () => {
    expect(montarCaminho("emp-1", "reembolsos", "nota.PDF", "abc")).toBe("emp-1/reembolsos/abc.pdf");
  });
  it("reconhece referência privada e ignora URL pública antiga", () => {
    expect(ehPrivado("privado://emp-1/x.pdf")).toBe(true);
    expect(ehPrivado("https://x.supabase.co/storage/v1/object/public/chat_media/a.pdf")).toBe(false);
    expect(caminhoPrivado("privado://emp-1/x.pdf")).toBe("emp-1/x.pdf");
  });
});
