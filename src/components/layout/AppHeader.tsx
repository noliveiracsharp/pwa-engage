import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import { pick } from "@/lib/row";

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { usuario, empresa, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const empresaNome = pick<string>(empresa, ["nome", "empresa_nome", "razao_social", "titulo", "descricao"], "Atende.ai");
  const empresaLogo = pick<string>(empresa, ["logo", "logo_url", "url_logo", "imagem", "avatar"]);
  const nome = pick<string>(usuario, ["nome", "nome_completo", "usuario_nome"], user?.email ?? "Usuário");
  const foto = pick<string>(usuario, ["foto", "avatar", "avatar_url", "imagem"]);
  const iniciais = (nome ?? "U").slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 sm:px-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
        {empresaLogo ? (
          <img src={empresaLogo} alt={empresaNome} className="h-8 w-auto max-w-[160px] object-contain" />
        ) : (
          <span className="text-lg font-bold tracking-tight text-foreground">{empresaNome}</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-9 w-9">
                {foto && <AvatarImage src={foto} alt={nome} />}
                <AvatarFallback>{iniciais}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{nome}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate({ to: "/meus-dados" })}>
              <User className="mr-2 h-4 w-4" /> Meus Dados
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
