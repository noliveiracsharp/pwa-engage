import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { preservarRecuperacao, validarRecuperacao } from "./recuperacao-senha";

function fixture(session = true) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: session ? { user: { id: "recovery-user" } } : null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "recovery-user" } }, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
  };
  return { auth, client: auth as unknown as SupabaseClient["auth"] };
}

describe("recuperação de senha", () => {
  it("não permite salvar sem sessão mesmo com type=recovery", async () => {
    const { client } = fixture(false);
    expect(await validarRecuperacao(client, "https://example.test/reset-password#type=recovery", null, () => false)).toBeNull();
  });
  it("não aceita sessão comum sem evidência de recuperação", async () => {
    const { client } = fixture();
    expect(await validarRecuperacao(client, "https://example.test/reset-password", null, () => false)).toBeNull();
  });
  it("confirma a identidade da sessão de recuperação no servidor", async () => {
    const { client, auth } = fixture();
    expect(await validarRecuperacao(client, "https://example.test/reset-password#type=recovery", null, () => false)).toBe("recovery-user");
    expect(auth.getUser).toHaveBeenCalledOnce();
  });
  it("rejeita um usuário não validado pelo servidor", async () => {
    const { client, auth } = fixture();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect(await validarRecuperacao(client, "https://example.test/reset-password#type=recovery", null, () => false)).toBeNull();
  });
  it("permite recarregar apenas a mesma recuperação já validada", async () => {
    const { client } = fixture();
    expect(await validarRecuperacao(client, "https://example.test/reset-password", "recovery-user", () => false)).toBe("recovery-user");
    expect(await validarRecuperacao(client, "https://example.test/reset-password", "another-user", () => false)).toBeNull();
  });
  it("preserva recuperação nas atualizações mas não sessões comuns", () => {
    expect(preservarRecuperacao("/reset-password")).toBe(true);
    expect(preservarRecuperacao("/dashboard")).toBe(false);
  });
});