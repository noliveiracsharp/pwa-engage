export const LIMITE_DOCUMENTO_OFICIAL = 20 * 1024 * 1024;
export function chaveCategoria(nome: string): string {
  return nome.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}
export function validarArquivoOficial(file: { size: number }): boolean {
  return file.size > 0 && file.size <= LIMITE_DOCUMENTO_OFICIAL;
}
