import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTableRows, rowId, text } from "@/lib/crud";
import { pick } from "@/lib/row";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { PasswordFields } from "@/components/usuarios/PasswordFields";


export function MeusDadosSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { usuario, user, isMaster, refreshUsuario } = useAuth();
  const queryClient = useQueryClient();
  const { data: empresas = [] } = useTableRows("empresas", isMaster);
  const { data: departamentos = [] } = useTableRows("usuarios_departamentos");
  const { data: perfisAll = [] } = useQuery({
    queryKey: ["perfil-todos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil").select("*");
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const [form, setForm] = useState({ foto: "", nome: "", email: "", cpf: "", cargo: "", telefone: "", departamento_id: "", perfil_id: "", empresa_id: "" });
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
      telefone: text(pick(usuario, ["telefone"])),
      departamento_id: text(pick(usuario, ["departamento_id"])),
      perfil_id: text(pick(usuario, ["perfil_id"])),
      empresa_id: text(pick(usuario, ["empresa_id"])),
    });
    setPw({ senha: "", confirma: "" });
  }, [usuario, user, open]);

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
      if ("telefone" in (usuario ?? {})) values["telefone"] = form.telefone || null;
      if (podeEditarPerfil && "departamento_id" in (usuario ?? {})) values["departamento_id"] = form.departamento_id || null;
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
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Meus Dados</SheetTitle>
          <SheetDescription>Atualize sua foto, dados de acesso e senha.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Informações pessoais</h3>
        <div className="space-y-4">
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
              <DocumentInput value={form.cpf} placeholder="CPF" onChange={(v) => set("cpf", v.slice(0, 11))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Telefone / WhatsApp</Label>
              <PhoneInput value={form.telefone} onChange={(v) => set("telefone", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Select value={form.departamento_id} onValueChange={(v) => set("departamento_id", v)} disabled={!podeEditarPerfil}>
                <SelectTrigger><SelectValue placeholder="Departamento" /></SelectTrigger>
                <SelectContent>
                  {departamentos.filter((d) => d["status"] !== false).map((d) => (
                    <SelectItem key={text(rowId(d))} value={text(rowId(d))}>{text(d["descricao"])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        </div>
      </section>

      <section>
        <PasswordFields senha={pw.senha} confirma={pw.confirma} onChange={(senha, confirma) => setPw({ senha, confirma })} />
      </section>

        </div>
        <div className="border-border bg-card border-t p-3">
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </div>
      </SheetContent>
    </Sheet>
  );
}
