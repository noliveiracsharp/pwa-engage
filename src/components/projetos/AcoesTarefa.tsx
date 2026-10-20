import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menu "3 pontinhos" com as ações de uma tarefa. */
export function AcoesTarefa({ onNovaAtividade, onEditar, onDuplicar, onExcluir, small }: {
  onNovaAtividade?: (() => void) | undefined; onEditar?: (() => void) | undefined; onDuplicar?: (() => void) | undefined; onExcluir?: (() => void) | undefined; small?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className={small ? "h-6 w-6" : undefined} aria-label="Ações da tarefa" title="Ações"
          onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {onNovaAtividade && <DropdownMenuItem onClick={onNovaAtividade}><Plus className="mr-2 h-4 w-4" />Nova atividade</DropdownMenuItem>}
        {onEditar && <DropdownMenuItem onClick={onEditar}><Pencil className="mr-2 h-4 w-4" />Editar tarefa</DropdownMenuItem>}
        {onDuplicar && <DropdownMenuItem onClick={onDuplicar}><Copy className="mr-2 h-4 w-4" />Duplicar tarefa</DropdownMenuItem>}
        {onExcluir && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onExcluir}><Trash2 className="mr-2 h-4 w-4" />Excluir tarefa</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
