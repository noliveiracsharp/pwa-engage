import * as React from "react";
import { Input } from "@/components/ui/input";
import { idiomaAtual } from "@/lib/i18n";

const MOEDA: Record<string, string> = { "pt-BR": "BRL", "en-US": "USD", "es-ES": "EUR" };

export function formatarMoeda(n: number): string {
  const idioma = idiomaAtual();
  return new Intl.NumberFormat(idioma, { style: "currency", currency: MOEDA[idioma] ?? "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

/** Converte o texto digitado (máscara por centavos) em número. */
export function moedaDeDigitos(texto: string): number {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? Number(digitos) / 100 : 0;
}

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string | number | null | undefined;
  onChange: (valor: string) => void;
};

/** Campo monetário: sempre exibe "R$ 0,00" (ou a moeda do idioma) e devolve o número como texto ("12280.7"). */
export function InputMoeda({ value, onChange, ...rest }: Props) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      className={`tabular-nums text-right ${rest.className ?? ""}`}
      value={formatarMoeda(Number.isFinite(n) ? n : 0)}
      onChange={(e) => onChange(String(moedaDeDigitos(e.target.value)))}
      onFocus={(e) => { const el = e.currentTarget; requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length)); }}
    />
  );
}
