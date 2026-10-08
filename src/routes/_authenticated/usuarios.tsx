import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { User } from "lucide-react";
import { toast } from "sonner";
import { createEphemeralAuthClient, supabase } from "@/integrations/supabase/client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { DepartamentosDialog } from "@/components/usuarios/DepartamentosDialog";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { rowId, text, useSaveRecord, useTableRows } from "@/lib/crud";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useSubmenuAbas } from "@/hooks/useMenu";
import { formatCpfCnpj, formatPhoneDisplay, matchesAny } from "@/lib/input-masks";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordFields } from "@/components/usuarios/PasswordFields";
import { PerfisTab } from "@/components/usuarios/PerfisTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CredenciaisDialog, type Credenciais } from "@/components/usuarios/CredenciaisDialog";

export const Route = createFileRoute("/_authenticated/usuarios")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Usuários — Atende.ai" },
      { name: "description", content: "Gestão dos usuários e perfis de acesso da plataforma." },
      { property: "og:title", content: "Usuários — Atende.ai" },
      { property: "og:description", content: "Gestão dos usuários e perfis de acesso da plataforma." },
    ],
  }),
  component: UsuariosPage,
});

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

function UsuariosPage() {
  const { data: rows = [], isLoading } = useTableRows("usuarios");
  const { data: perfis = [] } = useTableRows("perfil");
  const { data: departamentos = [] } = useTableRows("usuarios_departamentos");
  const [deptOpen, setDeptOpen] = useState(false);
  const { data: empresas = [] } = useTableRows("empresas");
  const { data: kanbans = [] } = useTableRows("kanban_nome");
  const { data: vinculos = [] } = useTableRows("usuario_kanban");
  const save = useSaveRecord("usuarios");
  const perms = usePagePermissions("/usuarios");
  const permsPerfil = usePagePermissions("/perfil");
  const abaPerfil = useSubmenuAbas("/usuarios").find((a) => a.path === "/perfil");
  const verPerfis = Boolean(abaPerfil) || permsPerfil.canRead;
  const { usuario, isMaster, empresa: empresaAtual } = useAuth();
  const userEmpresaId = text(
    pick(usuario, ["empresa_id", "id_empresa"]) ?? (empresaAtual ? rowId(empresaAtual) : ""),
  );
  const empresasPermitidas = useMemo(() => {
    const ativas = empresas.filter((e) => e["status"] !== false && e["ativo"] !== false);
    if (isMaster) return ativas;
    if (!userEmpresaId) return [];
    return empresas.filter(
      (e) => text(rowId(e)) === userEmpresaId || text(e["empresa_pai_id"]) === userEmpresaId,
    );
  }, [empresas, isMaster, userEmpresaId]);
  const empresaLimiteId = text(empresaAtual ? rowId(empresaAtual) : "") || userEmpresaId;
  const { data: planoEmpresa } = useQuery({
    queryKey: ["plano-empresa-limite", empresaLimiteId],
    enabled: Boolean(empresaLimiteId),
    queryFn: async () => {
      const { data: ass } = await supabase.from("empresas_assinaturas" as never).select("plano_base_id").eq("empresa_id", empresaLimiteId).maybeSingle();
      const planoId = (ass as Row | null)?.["plano_base_id"];
      if (!planoId) return null;
      const { data: plano } = await supabase.from("planos_base" as never).select("nome, usuarios_inclusos, valor_usuario_adicional").eq("id", planoId as never).maybeSingle();
      return (plano as Row | null) ?? null;
    },
  });
  const usuariosAtivosEmpresa = rows.filter((u) => text(u["empresa_id"]) === empresaLimiteId && u["status"] !== false).length;
  const limitePlano = planoEmpresa ? Number(planoEmpresa["usuarios_inclusos"] ?? 0) : 0;
  const excedeLimite = Boolean(planoEmpresa) && limitePlano > 0 && usuariosAtivosEmpresa + 1 > limitePlano;
  const valorAdicional = Number(planoEmpresa?.["valor_usuario_adicional"] ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const avisoLimiteNovo = excedeLimite ? (
    <div className="mb-4 rounded-md border border-warning bg-warning/10 p-3 text-sm text-foreground">
      <strong>Limite do plano atingido.</strong> O plano {text(planoEmpresa?.["nome"])} inclui {limitePlano} usuários e a empresa já tem {usuariosAtivosEmpresa} ativos.
      Este novo usuário gerará uma cobrança adicional de {valorAdicional}/mês na próxima fatura.
    </div>
  ) : null;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [kanbanSel, setKanbanSel] = useState<string[]>([]);
  const [pw, setPw] = useState({ senha: "", confirma: "" });
  const [cred, setCred] = useState<Credenciais | null>(null);
  const [f, setF] = useState({ busca: "", status: "todos", perfil: "todos" });
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [removing, setRemoving] = useState(false);

  const inativar = async () => {
    if (!toDelete) return;
    setRemoving(true);
    const { error } = await supabase.from("usuarios").update({ status: false }).eq("id", rowId(toDelete) as never);
    setRemoving(false);
    if (error) {
      console.error(error);
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["table", "usuarios"] });
    toast.success("Usuário inativado.");
    setToDelete(null);
  };

  const excluir = async () => {
    if (!toDelete) return;
    setRemoving(true);
    try {
      const uid = rowId(toDelete) as never;
      await supabase.from("usuario_kanban").delete().eq("usuario_id", uid);
      const { error } = await supabase.from("usuarios").delete().eq("id", uid);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["table", "usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["table", "usuario_kanban"] });
      const { error: authError } = await supabase.rpc("admin_delete_auth_user" as never, { p_user_id: uid } as never);
      if (authError) {
        console.error(authError);
        toast.warning("Usuário excluído, mas o acesso (login) não foi removido: " + authError.message);
      } else {
        toast.success("Usuário e acesso excluídos.");
      }
      setToDelete(null);
    } catch (e) {
      console.error(e);
      const err = e as { code?: string; message?: string };
      const fk = err.code === "23503" || /foreign key|violates|viola/i.test(err.message ?? "");
      toast.error(
        fk
          ? "Este usuário possui registros associados no sistema (tarefas, atendimentos ou orçamentos) e não pode ser excluído fisicamente. Recomendamos inativá-lo."
          : err.message || "Não foi possível excluir.",
      );
    } finally {
      setRemoving(false);
    }
  };

  const openRecord = (row: Row | null) => {
    setRecord(row);
    setPw({ senha: "", confirma: "" });
    const uid = row ? text(rowId(row)) : "";
    setKanbanSel(
      row
        ? vinculos.filter((v) => text(v["usuario_id"]) === uid).map((v) => text(v["kanban_nome_id"]))
        : [],
    );
    setOpen(true);
  };

  /** Replaces all usuario_kanban rows of the user with the current selection. */
  const syncKanbans = async (uid: string, ids: string[]) => {
    const { error: delError } = await supabase.from("usuario_kanban").delete().eq("usuario_id", uid);
    if (delError) throw delError;
    if (ids.length) {
      const { error } = await supabase
        .from("usuario_kanban")
        .insert(ids.map((kanban_nome_id) => ({ usuario_id: uid, kanban_nome_id })));
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: ["table", "usuario_kanban"] });
  };

  /** New user: creates the auth.users access first, then the usuarios row linked by id. */
  const createUser = useMutation({
    mutationFn: async (values: Row) => {
      const email = text(values["email"]).trim();
      const password = pw.senha;
      if (!email) throw new Error("Informe o e-mail do usuário.");
      if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
      // Ephemeral client: creates the auth access without replacing the
      // session of the user who is currently logged in.
      const authClient = createEphemeralAuthClient();
      let { data, error } = await authClient.auth.signUp({ email, password });
      if (error && /already registered|already exists/i.test(error.message)) {
        // Login órfão (sem cadastro em usuarios): remove e tenta de novo.
        if (rows.some((u) => text(u["email"]).trim().toLowerCase() === email.toLowerCase())) {
          throw new Error("Este e-mail já pertence a um usuário cadastrado.");
        }
        const { data: limpou, error: rpcError } = await supabase.rpc("admin_limpar_auth_orfao" as never, { p_email: email } as never);
        if (rpcError || !limpou) {
          throw new Error(
            "Este e-mail já possui um acesso antigo no sistema e não pôde ser liberado automaticamente. Peça ao administrador para liberar o e-mail.",
          );
        }
        ({ data, error } = await authClient.auth.signUp({ email, password }));
      }
      if (error) {
        if (/already registered|already exists/i.test(error.message)) throw new Error("Este e-mail já está cadastrado.");
        if (/password/i.test(error.message)) throw new Error("Senha inválida: use pelo menos 6 caracteres.");
        if (/invalid.*email|email.*invalid/i.test(error.message)) throw new Error("E-mail inválido.");
        throw error;
      }
      const uid = data.user?.id;
      if (!uid) throw new Error("Não foi possível criar o acesso do usuário.");
      const rest: Row = { ...values };
      delete rest["senha"];
      const { error: insertError } = await supabase.from("usuarios").insert({ ...rest, id: uid });
      if (insertError) throw insertError;
      await syncKanbans(uid, kanbanSel);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", "usuarios"] });
      toast.success("Usuário criado com sucesso.");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    },
  });

  const handleSave = (input: Row) => {
    const values: Row = { ...input };
    // Trava: usuário comum só grava empresas da sua matriz/filiais.
    if (!isMaster) {
      const ids = new Set(empresasPermitidas.map((e) => text(rowId(e))));
      const escolhida = text(values["empresa_id"]);
      if (!userEmpresaId) {
        toast.error("Não foi possível identificar sua empresa.");
        return;
      }
      values["empresa_id"] = escolhida && ids.has(escolhida) ? values["empresa_id"] : userEmpresaId;
    } else if (!text(values["empresa_id"]) && userEmpresaId) {
      values["empresa_id"] = userEmpresaId;
    }
    if (pw.senha !== pw.confirma) {
      toast.error("As senhas não conferem.");
      return;
    }
    if (pw.senha && pw.senha.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    const empresaIdCred = text(values["empresa_id"]);
    const empresaNomeCred = text(
      pick(empresasPermitidas.find((e) => text(rowId(e)) === empresaIdCred) ?? {}, ["nome_fantasia", "razao_social", "nome"], ""),
    );
    const credBase = {
      nome: text(values["nome"]),
      email: text(values["email"]).trim(),
      senha: pw.senha,
      telefone: text(pick(values, ["telefone", "celular", "whatsapp"], pick(record ?? {}, ["telefone", "celular", "whatsapp"], ""))),
      empresaId: empresaIdCred,
      empresaNome: empresaNomeCred,
    };
    if (record) {
      const rest: Row = { ...values };
      delete rest["senha"];
      const uid = text(rowId(record));
      const emailMudou = credBase.email.toLowerCase() !== text(record["email"]).trim().toLowerCase();
      const senhaDigitada = pw.senha;
      save.mutate(
        { values: rest, original: record },
        {
          onSuccess: async () => {
            try {
              await syncKanbans(uid, kanbanSel);
              if (senhaDigitada) {
                const { error } = await supabase.rpc("admin_set_user_password", {
                  p_user_id: uid,
                  p_password: senhaDigitada,
                });
                if (error) throw new Error("Senha não alterada: " + error.message);
                toast.success("Senha alterada.");
              }
              setOpen(false);
              if (senhaDigitada || emailMudou) {
                setCred({
                  ...credBase,
                  motivo: senhaDigitada && emailMudou ? "senha_email" : senhaDigitada ? "senha" : "email",
                });
              }
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível salvar os kanbans.");
            }
          },
        },
      );
    } else {
      createUser.mutate(values, {
        onSuccess: () => {
          setOpen(false);
          setCred({ ...credBase, motivo: "novo" });
        },
      });
    }
  };

  const readOnlySheet = record ? !perms.canUpdate : !perms.canCreate;
  const kanbanPicker = (
    <div className="space-y-6">
    {(record ? perms.canUpdate : perms.canCreate) && (
      <PasswordFields
        senha={pw.senha}
        confirma={pw.confirma}
        required={!record}
        onChange={(senha, confirma) => setPw({ senha, confirma })}
      />
    )}
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Kanbans</p>
      <p className="text-muted-foreground text-xs">Nenhum marcado = acesso a todos.</p>
      <div className="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        {kanbans.length === 0 && (
          <span className="text-muted-foreground text-sm">Nenhum kanban cadastrado.</span>
        )}
        {kanbans.map((k) => {
          const id = text(rowId(k));
          return (
            <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={kanbanSel.includes(id)}
                disabled={readOnlySheet}
                onCheckedChange={(c) =>
                  setKanbanSel((s) => (c ? [...s, id] : s.filter((x) => x !== id)))
                }
              />
              {text(pick(k, ["nome"], "Kanban"))}
            </label>
          );
        })}
      </div>
    </div>
    </div>
  );

  const perfilNome = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of perfis) map.set(text(rowId(p)), text(pick(p, ["descricao"], "—")));
    return map;
  }, [perfis]);

  /** Ordem de todos os perfis (inclui Master) para hierarquia. */
  const { data: ordemPerfil = new Map<string, number>() } = useQuery({
    queryKey: ["perfil-ordens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil").select("id, ordem");
      if (error) throw error;
      return new Map((data ?? []).map((p: Row) => [text(p["id"]), Number(p["ordem"])]));
    },
  });
  const userPerfilOrdem = ordemPerfil.get(text(pick(usuario, ["perfil_id", "id_perfil"])));

  const perfisPermitidos = useMemo(
    () =>
      perfis.filter((p) => {
        const o = Number(p["ordem"]);
        if (!(o > 0)) return false;
        if (isMaster) return true;
        return userPerfilOrdem !== undefined && o >= userPerfilOrdem;
      }),
    [perfis, isMaster, userPerfilOrdem],
  );

  const perfilOptions = useMemo(
    () => [
      { value: "todos", label: "Todos" },
      ...perfisPermitidos.map((p) => ({ value: text(rowId(p)), label: text(pick(p, ["descricao"], "Perfil")) })),
    ],
    [perfisPermitidos],
  );

  const fields: Field[] = useMemo(
    () => [
      { fields: ["foto"], label: "Foto", type: "photo", full: true },
      { fields: ["nome"], label: "Nome", full: true },
      { fields: ["email"], label: "E-mail", type: "email" },
      { fields: ["cpf"], label: "CPF", type: "document" },
      { fields: ["telefone"], label: "Telefone / WhatsApp", type: "tel" },
      { fields: ["cargo"], label: "Cargo" },
      {
        fields: ["departamento_id"],
        label: "Departamento",
        type: "select",
        options: departamentos
          .filter((d) => d["status"] !== false)
          .map((d) => ({ value: text(rowId(d)), label: text(d["descricao"]) })),
      },
      { fields: ["status"], label: "Status", type: "boolean" },
      {
        fields: ["perfil_id"],
        label: "Perfil",
        type: "select",
        options: perfilOptions.filter((o) => o.value !== "todos"),
      },
      ...(empresasPermitidas.length > 1 || (isMaster && empresasPermitidas.length > 0)
        ? [
            {
              fields: ["empresa_id"],
              label: "Empresa",
              type: "select" as const,
              options: empresasPermitidas.map((e) => ({
                value: text(rowId(e)),
                label: text(pick(e, ["nome_fantasia", "razao_social", "nome"], "Empresa")),
              })),
            },
          ]
        : []),
    ],
    [perfilOptions, empresasPermitidas, isMaster, record, departamentos],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (isMaster || ordemPerfil.get(text(pick(row, ["perfil_id"]))) !== 0) &&
          matchesAny(
            [pick(row, ["nome"]), pick(row, ["email"]), pick(row, ["cpf"]), pick(row, ["cargo"])],
            f.busca,
          ) &&
          (f.status === "todos" ||
            (f.status === "ativo" ? row["status"] === true : row["status"] === false)) &&
          (f.perfil === "todos" || text(pick(row, ["perfil_id"])) === f.perfil),
      ),
    [rows, f, isMaster, ordemPerfil],
  );

  const columns: Column[] = [
    {
      key: "nome",
      header: "Nome",
      fields: ["nome"],
      render: (row) => {
        const foto = text(pick(row, ["foto"]));
        const nome = text(pick(row, ["nome"], "—"));
        return (
          <div className="flex items-center gap-2.5">
            {foto ? (
              <img
                src={foto}
                alt={nome}
                className="border-border h-8 w-8 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span className="bg-muted text-muted-foreground border-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
                <User className="h-4 w-4" />
              </span>
            )}
            <span>{nome}</span>
          </div>
        );
      },
    },
    { key: "email", header: "E-mail", fields: ["email"] },
    {
      key: "cpf",
      header: "CPF",
      fields: ["cpf"],
      render: (row) => formatCpfCnpj(text(pick(row, ["cpf"]))) || "—",
    },
    {
      key: "telefone",
      header: "Telefone",
      fields: ["telefone"],
      render: (row) => formatPhoneDisplay(text(pick(row, ["telefone"]))) || "—",
    },
    { key: "cargo", header: "Cargo", fields: ["cargo"] },
    {
      key: "perfil",
      header: "Perfil",
      fields: ["perfil_id"],
      render: (row) => perfilNome.get(text(pick(row, ["perfil_id"]))) ?? "—",
    },
    {
      key: "status",
      header: "Status",
      fields: ["status"],
      render: (row) => <StatusBadge value={row["status"]} />,
    },
  ];

  return (
    <Tabs defaultValue="usuarios" className="space-y-4">
      <TabsContent value="usuarios">
      <DataTable
        title="Usuários"
        columns={columns}
        rows={filtered}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={
          perms.canCreate
            ? () => openRecord(null)
            : undefined
        }
        onEdit={(row) => openRecord(row)}
        editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? (row) => setToDelete(row) : undefined}
        skipDeleteConfirm
        filters={
          <>
            <FilterInput
              label="Buscar"
              value={f.busca}
              onChange={(v) => setF({ ...f, busca: v })}
              placeholder="Nome, e-mail, CPF ou cargo"
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Perfil"
              value={f.perfil}
              onChange={(v) => setF({ ...f, perfil: v })}
              options={perfilOptions}
            />
            <Button variant="outline" className="self-end" onClick={() => setDeptOpen(true)}>Departamentos</Button>
          </>
        }
      />

      <DepartamentosDialog open={deptOpen} onOpenChange={setDeptOpen} empresaId={text(empresaAtual ? rowId(empresaAtual) : "") || userEmpresaId} />
      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title={record ? "Editar usuário" : "Novo usuário"}
        description={
          record
            ? "Altere os dados do usuário."
            : "Informe e-mail e senha para criar o acesso do usuário automaticamente."
        }
        fields={fields}
        record={record}
        readOnly={readOnlySheet}
        extra={<>{!record && avisoLimiteNovo}{kanbanPicker}</>}
        saving={save.isPending || createUser.isPending}
        onSave={handleSave}
      />

      <CredenciaisDialog dados={cred} onClose={() => setCred(null)} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja inativar este usuário ou excluí-lo permanentemente?
              {toDelete && <strong className="block pt-2">{text(pick(toDelete, ["nome", "email"], ""))}</strong>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" disabled={removing} onClick={inativar}>
              Inativar
            </Button>
            <Button variant="destructive" disabled={removing} onClick={excluir}>
              Excluir permanentemente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </TabsContent>
    </Tabs>
  );
}
