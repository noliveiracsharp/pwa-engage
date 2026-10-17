import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { rowId, text, useDeleteRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { toast } from "sonner";

type Props = { funcaoId: string | number | undefined };

export function FuncaoPerfis({ funcaoId }: Props) {
  const queryClient = useQueryClient();
  const { data: perfis = [] } = useTableRows("perfil");
  const { data: menu = [] } = useTableRows("menu");
  const removeMenu = useDeleteRecord("menu");

  const [perfilId, setPerfilId] = useState("");
  const [novoPerfil, setNovoPerfil] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ descricao: "", ordem: "", status: true });
  const perfisAtivos = useMemo(() => perfis.filter((p) => p["status"] !== false), [perfis]);
  const [perms] = useState({
    can_create: true,
    can_read: true,
    can_update: true,
    can_delete: false,
    status: true,
  });

  const PERM_LABELS: { key: keyof typeof perms; label: string }[] = [
    { key: "can_create", label: "Criar" },
    { key: "can_read", label: "Ler" },
    { key: "can_update", label: "Editar" },
    { key: "can_delete", label: "Excluir" },
    { key: "status", label: "Ativo" },
  ];

  const togglePerm = async (row: Row, key: keyof typeof perms, value: boolean) => {
    const { error } = await supabase
      .from("menu")
      .update({ [key]: value })
      .eq("id", row["id"] as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["table", "menu"] });
  };

  const vinculos = useMemo(() => {
    const nome = (id: unknown) =>
      text(pick(perfis.find((p) => String(rowId(p)) === String(id)) ?? {}, ["descricao", "nome", "titulo"]));
    return menu
      .filter((row) => String(pick(row, ["funcoes_id", "funcao_id"]) ?? "") === String(funcaoId ?? ""))
      .sort((a, b) =>
        nome(pick(a, ["perfil_id"])).localeCompare(nome(pick(b, ["perfil_id"])), "pt-BR", { sensitivity: "base" }),
      );
  }, [menu, funcaoId, perfis]);

  const perfilNome = (id: unknown) => {
    const found = perfis.find((p) => String(rowId(p)) === String(id));
    return found ? text(pick(found, ["descricao", "nome", "titulo"])) : text(id);
  };

  const criarPerfil = async () => {
    const descricao = novoPerfil.trim();
    if (!descricao) return;
    setSaving(true);
    const { data, error } = await supabase.from("perfil").insert({ descricao }).select().single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["table", "perfil"] });
    setNovoPerfil("");
    setNovoOpen(false);
    setPerfilId(String(rowId(data as Row) ?? ""));
    toast.success("Perfil criado.");
  };

  const abrirEdicao = () => {
    const p = perfis.find((x) => String(rowId(x)) === perfilId);
    if (!p) {
      toast.error("Selecione um perfil para editar.");
      return;
    }
    setEdit({
      descricao: text(pick(p, ["descricao", "nome"])),
      ordem: String(p["ordem"] ?? ""),
      status: p["status"] !== false,
    });
    setEditOpen(true);
  };

  const salvarEdicao = async () => {
    const descricao = edit.descricao.trim();
    const ordem = Number(edit.ordem);
    if (!descricao) { toast.error("Informe a descrição."); return; }
    if (!(ordem > 0)) { toast.error("Informe um nível maior que zero."); return; }
    setSaving(true);
    const { error } = await supabase
      .from("perfil")
      .update({ descricao, ordem, status: edit.status })
      .eq("id", perfilId as never);
    setSaving(false);
    if (error) {
      toast.error(/status/i.test(error.message) ? "Rode o script atendeai-perfil-status.sql para habilitar a inativação." : error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["table", "perfil"] });
    setEditOpen(false);
    toast.success("Perfil atualizado.");
  };

  const liberarTodos = async () => {
    if (!funcaoId) {
      toast.error("Salve a função antes de liberar perfis.");
      return;
    }
    const ja = new Set(vinculos.map((r) => String(pick(r, ["perfil_id"]) ?? "")));
    const novos = perfisAtivos.filter((p) => !ja.has(String(rowId(p))));
    if (novos.length === 0) {
      toast.info("Todos os perfis já possuem acesso a esta função.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("menu").insert(
      novos.map((p) => ({
        perfil_id: rowId(p),
        funcoes_id: funcaoId,
        can_create: true,
        can_read: true,
        can_update: true,
        can_delete: true,
        status: true,
      })),
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["table", "menu"] });
    toast.success(`${novos.length} perfil(is) liberado(s) com acesso total.`);
  };

  const vincular = async () => {
    if (!funcaoId) {
      toast.error("Salve a função antes de liberar perfis.");
      return;
    }
    if (!perfilId) {
      toast.error("Selecione um perfil.");
      return;
    }
    if (vinculos.some((row) => String(pick(row, ["perfil_id"]) ?? "") === perfilId)) {
      toast.error("Esse perfil já está liberado.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("menu")
      .insert({ perfil_id: perfilId, funcoes_id: funcaoId, ...perms });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["table", "menu"] });
    setPerfilId("");
    toast.success("Perfil liberado para esta função.");
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Perfis com acesso</h3>
        <p className="text-muted-foreground text-xs">
          Selecione um perfil existente ou cadastre um novo para liberar esta função.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:max-w-sm">
          <Label htmlFor="perfil-select">Perfil</Label>
          <Select value={perfilId} onValueChange={setPerfilId}>
            <SelectTrigger id="perfil-select">
              <SelectValue placeholder="Selecione um perfil" />
            </SelectTrigger>
            <SelectContent>
              {perfis.map((p) => (
                <SelectItem key={String(rowId(p))} value={String(rowId(p))}>
                  {text(pick(p, ["descricao", "nome", "titulo"]))}
                  {p["status"] === false ? " (inativo)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={abrirEdicao}
            disabled={saving || !perfilId}
            aria-label="Editar perfil"
            title="Editar perfil"
          >
            <Pencil className="size-4" />
          </Button>
          <Button type="button" variant="outline" onClick={() => setNovoOpen(true)} disabled={saving}>
            <Plus className="mr-1 size-4" /> Adicionar
          </Button>
          <Button type="button" onClick={vincular} disabled={saving || !perfilId || perfis.find((p) => String(rowId(p)) === perfilId)?.["status"] === false}>
            Liberar
          </Button>
          <Button type="button" variant="secondary" onClick={liberarTodos} disabled={saving || !funcaoId}>
            <Users className="mr-1 size-4" /> Liberar para todos
          </Button>
        </div>
      </div>

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo perfil</DialogTitle>
            <DialogDescription>Cadastre um novo perfil de usuário para liberar esta função.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="perfil-novo">Descrição</Label>
            <Input
              id="perfil-novo"
              value={novoPerfil}
              placeholder="Descrição do perfil"
              autoFocus
              onChange={(e) => setNovoPerfil(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  criarPerfil();
                }
              }}
            />
          </div>
          <DialogFooter className="border-t pt-4 mt-4">
            <Button type="button" variant="outline" onClick={() => setNovoOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={criarPerfil} disabled={saving || !novoPerfil.trim()}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>Quanto menor o nível, maior a hierarquia. Perfis inativos não podem ser liberados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="perfil-edit-desc">Descrição</Label>
              <Input
                id="perfil-edit-desc"
                value={edit.descricao}
                onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil-edit-ordem">Nível (ordem)</Label>
              <Input
                id="perfil-edit-ordem"
                type="number"
                min={1}
                value={edit.ordem}
                onChange={(e) => setEdit({ ...edit, ordem: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="perfil-edit-status">Perfil ativo</Label>
              <Switch
                id="perfil-edit-status"
                checked={edit.status}
                onCheckedChange={(v) => setEdit({ ...edit, status: v })}
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-4">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvarEdicao} disabled={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Perfil</TableHead>
              {PERM_LABELS.map(({ label }) => (
                <TableHead key={label} className="w-[100px] text-center">
                  {label}
                </TableHead>
              ))}
              <TableHead className="w-[80px] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!funcaoId ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-4 text-center text-sm">
                  Salve a função antes de liberar perfis.
                </TableCell>
              </TableRow>
            ) : vinculos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-4 text-center text-sm">
                  Nenhum perfil liberado para esta função.
                </TableCell>
              </TableRow>
            ) : (
              vinculos.map((row, i) => {
                const vinculoId = String(rowId(row) ?? i);
                return (
                  <TableRow key={vinculoId}>
                    <TableCell className="font-medium">
                      {perfilNome(pick(row, ["perfil_id"]))}
                    </TableCell>
                    {PERM_LABELS.map(({ key, label }) => (
                      <TableCell key={`${vinculoId}-${key}`} className="text-center">
                        <Switch
                          id={`${vinculoId}-${key}`}
                          className="mx-auto"
                          checked={row[key] === true}
                          onCheckedChange={(v) => togglePerm(row, key, v)}
                          aria-label={label}
                        />
                      </TableCell>
                    ))}
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeMenu.mutate(row)}
                      aria-label="Remover acesso"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
