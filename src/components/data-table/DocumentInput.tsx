import { Input } from "@/components/ui/input";
import { digitsOnly, formatCpfCnpj } from "@/lib/input-masks";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function DocumentInput({ id, value, onChange, placeholder = "CPF ou CNPJ" }: Props) {
  return (
    <Input
      id={id}
      value={formatCpfCnpj(value)}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      maxLength={18}
      onChange={(event) => onChange(digitsOnly(event.target.value).slice(0, 14))}
    />
  );
}