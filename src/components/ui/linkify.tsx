/** Transforma URLs do texto em links clicáveis (abrem em nova aba). */
export function Linkify({ text }: { text: string }) {
  const partes = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all underline">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}
