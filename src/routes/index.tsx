import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/login", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Atende.ai — Suporte e atendimento multicanal" },
      {
        name: "description",
        content: "Plataforma multiempresa de suporte e atendimento multicanal com IA, kanban e chat.",
      },
      { property: "og:title", content: "Atende.ai — Suporte e atendimento multicanal" },
      {
        property: "og:description",
        content: "Plataforma multiempresa de suporte e atendimento multicanal com IA, kanban e chat.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
