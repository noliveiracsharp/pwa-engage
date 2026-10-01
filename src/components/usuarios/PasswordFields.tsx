import { useState } from "react";
import { Eye, EyeOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

type Props = {
  senha: string;
  confirma: string;
  onChange: (senha: string, confirma: string) => void;
  required?: boolean;
  disabled?: boolean;
};

export function PasswordFields({ senha, confirma, onChange, required, disabled }: Props) {
  const [show, setShow] = useState(false);
  const mismatch = confirma.length > 0 && senha !== confirma;

  const gerar = async () => {
    const p = generatePassword();
    onChange(p, p);
    setShow(true);
    try {
      await navigator.clipboard.writeText(p);
      toast.success("Senha gerada e copiada.");
    } catch {
      toast.success("Senha gerada.");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{required ? "Senha de acesso" : "Alterar senha"}</p>
        {!required && (
          <p className="text-muted-foreground text-xs">Deixe em branco para manter a senha atual.</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Senha</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={show ? "text" : "password"}
                value={senha}
                disabled={disabled}
                autoComplete="new-password"
                onChange={(e) => onChange(e.target.value, confirma)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2"
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={gerar} disabled={disabled} title="Gerar senha automática">
              <Wand2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Confirmar senha</Label>
          <Input
            type={show ? "text" : "password"}
            value={confirma}
            disabled={disabled}
            autoComplete="new-password"
            onChange={(e) => onChange(senha, e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch && <p className="text-destructive text-xs">As senhas não conferem.</p>}
        </div>
      </div>
    </div>
  );
}
