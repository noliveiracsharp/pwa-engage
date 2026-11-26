import { expect, it } from 'vitest';
import { chaveCategoria, validarArquivoOficial } from './documentos-oficiais';
it('Escritório e Escritorio identificam a mesma categoria',()=>{
 expect(chaveCategoria('Escritório')).toBe(chaveCategoria('Escritorio'));
 expect(chaveCategoria('Escritório')).not.toBe(chaveCategoria('Apresentações'));
});
it('aceita até 20 MB e rejeita arquivos maiores',()=>{
 expect(validarArquivoOficial({size:20*1024*1024})).toBe(true);
 expect(validarArquivoOficial({size:20*1024*1024+1})).toBe(false);
});