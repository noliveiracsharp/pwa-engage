import type { ElementType } from "react";
import { Circle, icons } from "lucide-react";
import {
  SiDiscord,
  SiFacebook,
  SiInstagram,
  SiMessenger,
  SiPinterest,
  SiSignal,
  SiSnapchat,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from "@icons-pack/react-simple-icons";

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
  pessoa: "Users",
  pessoas: "Users",
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

type IconComponent = ElementType;

const BRAND_ICONS: Record<string, IconComponent> = {
  "brand-whatsapp": SiWhatsapp,
  whatsapp: SiWhatsapp,
  "brand-instagram": SiInstagram,
  instagram: SiInstagram,
  "brand-facebook": SiFacebook,
  facebook: SiFacebook,
  "brand-messenger": SiMessenger,
  messenger: SiMessenger,
  "brand-telegram": SiTelegram,
  telegram: SiTelegram,
  "brand-youtube": SiYoutube,
  youtube: SiYoutube,
  "brand-tiktok": SiTiktok,
  tiktok: SiTiktok,
  "brand-x": SiX,
  twitter: SiX,
  "brand-threads": SiThreads,
  threads: SiThreads,
  "brand-discord": SiDiscord,
  discord: SiDiscord,
  "brand-signal": SiSignal,
  signal: SiSignal,
  "brand-pinterest": SiPinterest,
  pinterest: SiPinterest,
  "brand-snapchat": SiSnapchat,
  snapchat: SiSnapchat,
};

export function getIcon(name: string | undefined): IconComponent {
  const registry = icons as Record<string, IconComponent>;
  const brand = BRAND_ICONS[(name ?? "").toLowerCase()];
  if (brand) return brand;
  const exact = name ? registry[name] : undefined;
  if (exact) return exact;

  const key = (name ?? "").toLowerCase();
  const candidate = ALIASES[key] ?? toPascal(key);
  return registry[candidate] ?? Circle;
}
