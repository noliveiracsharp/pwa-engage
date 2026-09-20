import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
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
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/dashboard" : "/login", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
