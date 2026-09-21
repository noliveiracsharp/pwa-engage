import { Circle, icons, type LucideIcon } from "lucide-react";

function toPascal(name: string) {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

const ALIASES: Record<string, string> = {
  dashboard: "LayoutDashboard",
  home: "Home",
  empresa: "Building2",
  empresas: "Building2",
  cliente: "Users",
  clientes: "Users",
  usuario: "UserCog",
  usuarios: "UserCog",
  funcao: "ShieldCheck",
  funcoes: "ShieldCheck",
  atendimento: "MessageCircle",
  atendimentos: "MessageCircle",
  chat: "MessageCircle",
  kanban: "Kanban",
  config: "Settings",
  configuracoes: "Settings",
};

export function getIcon(name: string | undefined): LucideIcon {
  const registry = icons as Record<string, LucideIcon>;
  const exact = name ? registry[name] : undefined;
  if (exact) return exact;

  const key = (name ?? "").toLowerCase();
  const candidate = ALIASES[key] ?? toPascal(key);
  return registry[candidate] ?? Circle;
}
