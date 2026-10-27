import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useMenu } from "@/hooks/useMenu";

/** "O que você quer fazer?": digite e vá direto para a função (Ctrl+K), respeitando as permissões do perfil. */
export function BuscaFuncoes() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data } = useMenu();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const itens = useMemo(() => {
    const vistos = new Set<string>();
    return (data ?? [])
      .filter((i) => i.path && i.path.startsWith("/") && !vistos.has(i.path) && vistos.add(i.path))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [data]);

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="O que você quer fazer?" title="O que você quer fazer? (Ctrl+K)" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="O que você quer fazer? Ex.: ofertas, contas a pagar, clientes…" />
        <CommandList>
          <CommandEmpty>Nenhuma função encontrada.</CommandEmpty>
          <CommandGroup heading="Funções">
            {itens.map((i) => (
              <CommandItem
                key={i.id + i.path}
                value={`${i.label} ${i.path}`}
                onSelect={() => { setOpen(false); navigate({ to: i.path as never }); }}
              >
                {i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
