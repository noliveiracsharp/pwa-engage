import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Atende.ai" },
      { name: "description", content: "Defina uma nova senha para sua conta no Atende.ai." },
      { property: "og:title", content: "Redefinir senha — Atende.ai" },
      { property: "og:description", content: "Defina uma nova senha para sua conta no Atende.ai." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível alterar a senha", { description: error.message });
      return;
    }
    toast.success("Senha atualizada!");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
        <h1 className="text-2xl font-bold text-foreground">Nova senha</h1>
        <div className="space-y-2">
          <Label htmlFor="nova">Senha</Label>
          <Input id="nova" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          Salvar nova senha
        </Button>
      </form>
    </div>
  );
}
