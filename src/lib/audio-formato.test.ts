import { describe, expect, it } from "vitest";
import { formatoAudio } from "./audio-formato";

const bytes = (s: string, prefix: number[] = []) => new Uint8Array([...prefix, ...[...s].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);

describe("formatoAudio", () => {
  it("reconhece áudio do iPhone (m4a) mesmo que o tipo informado seja ogg", () => {
    expect(formatoAudio(bytes("ftypM4A ", [0, 0, 0, 0x20]))).toEqual({ ext: "m4a", mime: "audio/mp4" });
  });
  it("reconhece mensagem de voz do WhatsApp (ogg/opus)", () => {
    expect(formatoAudio(bytes("OggS"))).toEqual({ ext: "ogg", mime: "audio/ogg" });
  });
  it("não inventa formato para conteúdo desconhecido", () => {
    expect(formatoAudio(bytes("{\"erro\":1}"))).toBeNull();
  });
});
