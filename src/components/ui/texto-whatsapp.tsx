import type { ReactNode } from "react";
import { Linkify } from "./linkify";

/** Mostra texto com a formatação do WhatsApp: *negrito* (ou **negrito**), _itálico_, ~tachado~ e links. */
export function TextoWhatsapp({ text }: { text: string }) {
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  const partes: ReactNode[] = [];
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > ultimo) partes.push(<Linkify key={i++} text={text.slice(ultimo, m.index)} />);
    const t = m[0];
    if (t.startsWith("**")) partes.push(<strong key={i++}>{t.slice(2, -2)}</strong>);
    else if (t[0] === "*") partes.push(<strong key={i++}>{t.slice(1, -1)}</strong>);
    else if (t[0] === "_") partes.push(<em key={i++}>{t.slice(1, -1)}</em>);
    else partes.push(<s key={i++}>{t.slice(1, -1)}</s>);
    ultimo = m.index + t.length;
  }
  if (ultimo < text.length) partes.push(<Linkify key={i++} text={text.slice(ultimo)} />);
  return <>{partes}</>;
}
