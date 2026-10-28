import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatadores, idiomaAtual, useIdioma, type Idioma } from "@/lib/i18n";

export function formatarMoeda(n: number, idioma: Idioma = idiomaAtual()): string {
  return formatadores(idioma).moeda(Number.isFinite(n) ? n : 0);
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

/** Campo em reais: idioma altera só a apresentação; devolve o número como texto ("12280.7"). */
export function InputMoeda({ value, onChange, ...rest }: Props) {
  const { idioma } = useIdioma();
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      className={`tabular-nums text-right ${rest.className ?? ""}`}
      value={formatarMoeda(Number.isFinite(n) ? n : 0, idioma)}
      onChange={(e) => onChange(String(moedaDeDigitos(e.target.value)))}
      onFocus={(e) => { const el = e.currentTarget; requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length)); }}
    />
  );
}
