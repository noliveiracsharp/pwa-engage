import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/landing/LegalPage";

const TITLE = "Política de Privacidade — Atende.ai";
const DESC = "Como o Atende.ai coleta, usa e protege seus dados, em linguagem simples e de acordo com a LGPD.";
const URL = "https://pwa-engage.lovable.app/privacidade";

export const Route = createFileRoute("/privacidade")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <LegalPage
      atual="privacidade"
      titulo="Política de Privacidade"
      resumo="Coletamos só o necessário para o sistema funcionar, não vendemos seus dados, registramos quem mexeu em quê e você pode pedir acesso, correção ou exclusão das suas informações."
      secoes={[
        { titulo: "Quem é responsável pelo quê", resumo: "Sua empresa decide sobre os dados; nós guardamos com segurança.", conteudo: <ul className="list-disc space-y-1 pl-6"><li><strong>Sua empresa (Controladora):</strong> decide quais dados de clientes, colaboradores e parceiros cadastrar.</li><li><strong>Atende.ai (Operador):</strong> oferece o sistema seguro onde esses dados ficam guardados.</li></ul> },
        { titulo: "Quais dados coletamos", conteudo: <ul className="list-disc space-y-1 pl-6"><li><strong>Da sua conta:</strong> nome, e-mail, telefone/WhatsApp, CPF ou CNPJ, cargo e dados de cobrança.</li><li><strong>Do uso do sistema:</strong> o que você cadastra (contatos, mensagens, ofertas, financeiro, tarefas).</li><li><strong>De segurança:</strong> endereço IP, data e hora de acesso e tipo de aparelho.</li></ul> },
        { titulo: "Para que usamos", conteudo: <ul className="list-disc space-y-1 pl-6"><li>Permitir seu acesso com as permissões certas;</li><li>Cobrar a assinatura e emitir faturas;</li><li>Enviar as mensagens e automações que você configurou;</li><li>Cumprir a lei (Marco Civil da Internet e LGPD).</li></ul> },
        { titulo: "Segurança e registro de ações", resumo: "Tudo fica anotado: quem fez, o quê e quando.", conteudo: <p>Criações, alterações e exclusões importantes ficam registradas com data, hora e usuário, em um histórico que ninguém consegue apagar. Isso protege sua empresa em caso de dúvidas ou disputas.</p> },
        { titulo: "Com quem compartilhamos", resumo: "Nunca vendemos seus dados.", conteudo: <p>Compartilhamos apenas com parceiros indispensáveis para o serviço: hospedagem em nuvem, envio de mensagens (como WhatsApp), pagamentos e emissão de notas fiscais.</p> },
        { titulo: "Por quanto tempo guardamos", conteudo: <ul className="list-disc space-y-1 pl-6"><li>Enquanto sua assinatura estiver ativa;</li><li>Registros de acesso: no mínimo 6 meses, como exige a lei;</li><li>Dados fiscais e financeiros: até 5 anos.</li></ul> },
        { titulo: "Seus direitos", resumo: "Você manda nos seus dados.", conteudo: <p>A qualquer momento você pode pedir para: saber se tratamos seus dados, ver uma cópia, corrigir algo errado, levar seus dados para outro serviço ou pedir a exclusão quando a lei permitir.</p> },
        { titulo: "Cookies", conteudo: <p>Usamos apenas cookies necessários para manter você conectado e lembrar suas preferências, como tema claro ou escuro.</p> },
        { titulo: "Fale com o Encarregado (DPO)", conteudo: <p>Para qualquer dúvida sobre privacidade ou para exercer seus direitos, escreva para <strong>privacidade@atende.ai</strong>. Responderemos em até 15 dias.</p> },
      ]}
    />
  );
}
