import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
  const [perms, setPerms] = useState({
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

  const vinculos = useMemo(
    () => menu.filter((row) => String(pick(row, ["funcoes_id", "funcao_id"]) ?? "") === String(funcaoId ?? "")),
    [menu, funcaoId],
  );

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

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="perfil-select">Perfil</Label>
          <Select value={perfilId} onValueChange={setPerfilId}>
            <SelectTrigger id="perfil-select">
              <SelectValue placeholder="Selecione um perfil" />
            </SelectTrigger>
            <SelectContent>
              {perfis.map((p) => (
                <SelectItem key={String(rowId(p))} value={String(rowId(p))}>
                  {text(pick(p, ["descricao", "nome", "titulo"]))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" onClick={() => setNovoOpen(true)} disabled={saving}>
            <Plus className="mr-1 size-4" /> Adicionar
          </Button>
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={vincular} disabled={saving}>
            Liberar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {PERM_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <Switch
              id={`perm-${key}`}
              checked={perms[key]}
              onCheckedChange={(v) => setPerms((p) => ({ ...p, [key]: v }))}
            />
            <Label htmlFor={`perm-${key}`} className="text-sm font-normal">
              {label}
            </Label>
          </div>
        ))}
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNovoOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={criarPerfil} disabled={saving || !novoPerfil.trim()}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {!funcaoId ? (
          <p className="text-muted-foreground text-xs">Salve a função para liberar perfis.</p>
        ) : vinculos.length === 0 ? (
          <p className="text-muted-foreground text-xs">Nenhum perfil liberado para esta função.</p>
        ) : (
          vinculos.map((row, i) => (
            <div
              key={String(rowId(row) ?? i)}
              className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
            >
              <span className="font-medium">{perfilNome(pick(row, ["perfil_id"]))}</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {PERM_LABELS.map(({ key, label }) => (
                  <label key={key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Switch
                      className="scale-90"
                      checked={row[key] === true}
                      onCheckedChange={(v) => togglePerm(row, key, v)}
                      aria-label={label}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeMenu.mutate(row)}
                aria-label="Remover acesso"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
