import { useNavigate } from "@tanstack/react-router";
import { FileText, MessageSquarePlus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePagePermissions } from "@/hooks/usePagePermissions";

/** Botão global "+ Criar": abre direto a criação nas telas de destino, respeitando can_create. */
export function CriarRapido() {
  const navigate = useNavigate();
  const cot = usePagePermissions("/cotacoes");
  const ofe = usePagePermissions("/orcamentos");
  const ate = usePagePermissions("/atendimentos");
  const algum = cot.canCreate || ofe.canCreate || ate.canCreate;
  if (!algum) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Criar rapidamente" title="Criar rapidamente">
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Criar rapidamente</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ate.canCreate && (
          <DropdownMenuItem onSelect={() => navigate({ to: "/atendimentos", search: { novo: "1" } as never })}>
            <MessageSquarePlus className="mr-2 h-4 w-4" /> Novo atendimento
          </DropdownMenuItem>
        )}
        {cot.canCreate && (
          <DropdownMenuItem onSelect={() => navigate({ to: "/cotacoes", search: { nova: "1" } as never })}>
            <ShoppingCart className="mr-2 h-4 w-4" /> Nova cotação
          </DropdownMenuItem>
        )}
        {ofe.canCreate && (
          <DropdownMenuItem onSelect={() => navigate({ to: "/orcamentos", search: { abrir: "novo" } as never })}>
            <FileText className="mr-2 h-4 w-4" /> Nova oferta
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
