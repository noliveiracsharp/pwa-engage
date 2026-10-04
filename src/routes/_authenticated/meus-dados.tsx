import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTableRows, rowId, text } from "@/lib/crud";
import { pick } from "@/lib/row";
import { formatCpfCnpj } from "@/lib/input-masks";

export const Route = createFileRoute("/_authenticated/meus-dados")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Meus Dados — Atende.ai" },
      { name: "description", content: "Edite seus dados de cadastro, foto, e-mail e senha no Atende.ai." },
      { property: "og:title", content: "Meus Dados — Atende.ai" },
      { property: "og:description", content: "Edite seus dados de cadastro, foto, e-mail e senha no Atende.ai." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeusDados,
});

function MeusDados() {
  const { usuario, user, isMaster, refreshUsuario } = useAuth();
  const queryClient = useQueryClient();
  const { data: empresas = [] } = useTableRows("empresas", isMaster);
  const { data: perfisAll = [] } = useQuery({
    queryKey: ["perfil-todos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil").select("*");
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const [form, setForm] = useState({ foto: "", nome: "", email: "", cpf: "", cargo: "", perfil_id: "", empresa_id: "" });
  const [pw, setPw] = useState({ senha: "", confirma: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    setForm({
      foto: text(pick(usuario, ["foto", "avatar", "avatar_url"])),
      nome: text(pick(usuario, ["nome", "nome_completo"])),
      email: text(pick(usuario, ["email"], user?.email)),
      cpf: text(pick(usuario, ["cpf"])),
      cargo: text(pick(usuario, ["cargo"])),
      perfil_id: text(pick(usuario, ["perfil_id"])),
      empresa_id: text(pick(usuario, ["empresa_id"])),
    });
  }, [usuario, user]);

  const meuPerfil = perfisAll.find((p) => text(p["id"]) === text(pick(usuario, ["perfil_id"])));
  const minhaOrdem = Number(meuPerfil?.["ordem"]);
  const podeEditarPerfil = isMaster || /administrador|gerente/i.test(text(meuPerfil?.["descricao"]));
  const perfisOpcoes = useMemo(
    () =>
      perfisAll.filter((p) => {
        const o = Number(p["ordem"]);
        if (text(p["id"]) === form.perfil_id) return true;
        if (!(o > 0)) return false;
        return isMaster || o >= minhaOrdem;
      }),
    [perfisAll, isMaster, minhaOrdem, form.perfil_id],
  );
  const empresasAtivas = empresas.filter((e) => e["status"] !== false && e["ativo"] !== false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async (): Promise<unknown> => {
    if (!usuario) return;
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return toast.error("Informe um e-mail válido.");
    if (pw.senha || pw.confirma) {
      if (pw.senha.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");
      if (pw.senha !== pw.confirma) return toast.error("As senhas não conferem.");
    }
    setSaving(true);
    try {
      const email = form.email.trim().toLowerCase();
      const emailMudou = email !== (user?.email ?? "").toLowerCase();
      if (emailMudou) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw new Error("E-mail de acesso não alterado: " + error.message);
      }
      const values: Record<string, unknown> = {
        foto: form.foto || null,
        nome: form.nome.trim(),
        email,
        cpf: form.cpf.replace(/\D/g, "") || null,
        cargo: form.cargo || null,
      };
      if (podeEditarPerfil && form.perfil_id) values["perfil_id"] = form.perfil_id;
      if (isMaster && form.empresa_id) values["empresa_id"] = form.empresa_id;
      const { error } = await supabase.from("usuarios").update(values).eq("id", rowId(usuario) as never);
      if (error) throw error;
      if (pw.senha) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: pw.senha });
        if (pwErr) throw new Error("Senha não alterada: " + pwErr.message);
        setPw({ senha: "", confirma: "" });
      }
      toast.success(
        emailMudou
          ? "Dados salvos. Confirme o novo e-mail pelo link enviado para concluir a troca do acesso."
          : "Dados salvos com sucesso.",
      );
      refreshUsuario();
      queryClient.invalidateQueries({ queryKey: ["table", "usuarios"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <h1 className="text-2xl font-bold text-foreground">Meus Dados</h1>
      <Card>
        <CardHeader>
          <CardTitle>Informações pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PhotoUpload value={form.foto} onChange={(v) => set("foto", v)} alt={form.nome} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF</Label>
              <Input value={formatCpfCnpj(form.cpf)} onChange={(e) => set("cpf", e.target.value.replace(/\D/g, "").slice(0, 11))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select value={form.perfil_id} onValueChange={(v) => set("perfil_id", v)} disabled={!podeEditarPerfil}>
                <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
                <SelectContent>
                  {perfisOpcoes.map((p) => (
                    <SelectItem key={text(p["id"])} value={text(p["id"])}>{text(p["descricao"])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isMaster && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Empresa</Label>
                <Select value={form.empresa_id} onValueChange={(v) => set("empresa_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
                  <SelectContent>
                    {empresasAtivas.map((e) => (
                      <SelectItem key={text(rowId(e))} value={text(rowId(e))}>
                        {text(pick(e, ["nome_fantasia", "razao_social", "nome"], "Empresa"))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" autoComplete="new-password" value={pw.senha} onChange={(e) => setPw({ ...pw, senha: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar senha</Label>
            <Input type="password" autoComplete="new-password" value={pw.confirma} onChange={(e) => setPw({ ...pw, confirma: e.target.value })} />
          </div>
          <p className="text-muted-foreground text-xs sm:col-span-2">Deixe em branco para manter a senha atual.</p>
        </CardContent>
      </Card>

      <div className="border-border bg-card fixed inset-x-0 bottom-0 z-10 border-t p-3">
        <div className="mx-auto flex max-w-2xl justify-end gap-2">
          <Button variant="outline" onClick={() => refreshUsuario()} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </div>
    </div>
  );
}
