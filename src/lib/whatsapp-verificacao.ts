import { parsePhoneNumberFromString } from "libphonenumber-js";
export function telefoneConsulta(value: string): string | null {
  const p = parsePhoneNumberFromString(value, "BR");
  return p?.isValid() ? p.number.replace(/\D/g, "") : null;
}
export function resultadoWhatsApp(body: Record<string, unknown>): boolean | null {
  return typeof body["exists"] === "boolean" ? body["exists"] : null;
}
