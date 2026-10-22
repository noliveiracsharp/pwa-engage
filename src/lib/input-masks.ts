import {
  AsYouType,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** Máscara monetária pt-BR: centavos preenchidos da direita para a esquerda ("249" → "2,49"). */
export function mascaraMoeda(value: string): string {
  const d = digitsOnly(value).replace(/^0+/, "").slice(0, 13);
  if (!d) return "";
  return (Number(d) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Número → texto mascarado (ex.: 1500 → "1.500,00"). */
export const moedaDeNumero = (n: number) =>
  n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

export function matchesMaskedValue(value: unknown, term: string): boolean {
  const query = term.trim();
  if (!query) return true;
  const rawValue = String(value ?? "").toLowerCase();
  if (rawValue.includes(query.toLowerCase())) return true;
  const queryDigits = digitsOnly(query);
  return queryDigits.length > 0 && digitsOnly(rawValue).includes(queryDigits);
}

/** True when the term matches ANY of the given values (plain text or masked digits). */
export function matchesAny(values: unknown[], term: string): boolean {
  if (!term.trim()) return true;
  return values.some((v) => matchesMaskedValue(v, term));
}

export function formatCpfCnpj(value: string): string {
  const digits = digitsOnly(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\/\d{4})(\d)/, "$1-$2");
}

function hasValidCheckDigits(value: string): boolean {
  const digits = digitsOnly(value);
  if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return false;

  const calculate = (base: string, weights: number[]) => {
    const total = base.split("").reduce((sum, digit, index) => sum + Number(digit) * (weights[index] ?? 0), 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  if (digits.length === 11) {
    const first = calculate(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = calculate(`${digits.slice(0, 9)}${first}`, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${first}${second}`);
  }

  const first = calculate(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculate(`${digits.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

export function isValidCpfCnpj(value: string): boolean {
  return hasValidCheckDigits(value);
}

export function countryFlag(country: CountryCode): string {
  return country
    .toUpperCase()
    .split("")
    .map((character) => String.fromCodePoint(character.charCodeAt(0) + 127397))
    .join("");
}

export function splitPhoneValue(value: string): { country: CountryCode; nationalNumber: string } {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed?.country) return { country: parsed.country, nationalNumber: parsed.nationalNumber };
  }
  return { country: "BR", nationalNumber: digitsOnly(trimmed).slice(0, 11) };
}

export function joinPhoneValue(country: CountryCode, nationalNumber: string): string {
  const digits = digitsOnly(nationalNumber);
  return digits ? `+${getCountryCallingCode(country)}${digits}` : "";
}

export function formatNationalPhone(country: CountryCode, value: string): string {
  return new AsYouType(country).input(digitsOnly(value).slice(0, 15));
}

/** Normaliza telefone salvo em qualquer formato para E.164 (+55...), corrigindo "55" duplicado. */
export function normalizePhone(value: string): string {
  const raw = String(value ?? "").trim();
  const d = digitsOnly(raw);
  if (!d) return "";
  if (d.startsWith("5555") && (d.length === 14 || d.length === 15)) return `+${d.slice(2)}`;
  if (raw.startsWith("+")) return `+${d}`;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return `+${d}`;
}

export function formatPhoneDisplay(value: string): string {
  if (!value) return "";
  const parsed = parsePhoneNumberFromString(normalizePhone(value));
  if (!parsed) return value;
  return parsed.country === "BR" ? parsed.formatNational() : parsed.formatInternational();
}

export function isCompletePhone(value: string): boolean {
  return value === "" || (value.startsWith("+") && isValidPhoneNumber(value));
}