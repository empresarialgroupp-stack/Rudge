# Rudge

Sistema pessoal de organização — tarefas, metas, hábitos e lembretes com notificações.
PWA instalável no computador (Chrome/Edge/Safari) e no celular (Android/iPhone), design
"liquid glass" monocromático com modo escuro e **modo white**.

## Acesso

Login com e-mail e senha. A senha é verificada por hash SHA-256 (`src/lib/auth.ts`); qualquer
e-mail válido é aceito. É uma trava de acesso pessoal no próprio dispositivo — não substitui
autenticação de servidor.

## O que o Rudge faz

- **Início**: saudação, resumo do dia, captura rápida em linguagem natural, KPIs, foco de hoje,
  metas em andamento, hábitos do dia, próximos lembretes e **Rudge sugere** (propostas contextuais).
- **Tarefas**: prazos, horário, prioridade, área, subtarefas, recorrência (concluir avança para a
  próxima data) e notificação antes do horário.
- **Metas**: assistente em 4 passos com 22 propostas SMART por área da vida, cálculo de ritmo
  (no ritmo / adiantada / atrasada), marcos automáticos, hábito de apoio que soma progresso e
  check-ins com notificação.
- **Hábitos**: dias da semana, lembrete diário, sequência, recorde, consistência e mapa de calor.
- **Lembretes**: "me lembre de pagar o boleto amanhã às 10h", recorrências (diário, dias úteis,
  semanal, mensal, anual), adiar e concluir.
- **Agenda** mensal, **Revisão semanal** guiada, paleta de comandos (`Ctrl/⌘ K`), atalho `N`
  para adicionar, backup/importação em JSON.

### Linguagem natural (pt-BR)

`hoje`, `amanhã`, `depois de amanhã`, `sexta`, `dia 15`, `15/11`, `20 de outubro`,
`às 9h`, `14:30`, `8 da noite`, `à tarde`, `em 20 min`, `daqui a 2 horas`, `todo dia`,
`dias úteis`, `toda segunda e quarta`, `todo dia 5`, `!!!` (prioridade), `#saude` (área).

## Notificações

O motor (`src/lib/scheduler.ts`) monta uma fila com lembretes, tarefas com horário, hábitos,
check-ins e prazos de metas, resumo da manhã, fechamento do dia e revisão semanal. Com o app em
foco aparece um aviso interno; em segundo plano/minimizado, notificação do sistema com os botões
**Concluir** e **Adiar** (tratados pelo service worker). A fila e o registro de disparos ficam no
IndexedDB, compartilhados com o service worker (sem duplicar avisos entre abas/recargas). Onde há
suporte, a sincronização periódica dispara lembretes vencidos com o app fechado.

Limite atual: sem servidor de push, os avisos dependem do Rudge estar aberto ou em segundo plano.
No computador, ative "Iniciar app ao fazer login" (passo a passo em **Instalar app**). Para avisos
com o app totalmente fechado no celular é preciso um servidor Web Push — o service worker já
trata o evento `push`.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes (interpretador, recorrência, fila de notificações, hash)
npm run build      # typecheck + build em dist/
npm run preview    # servir o build (o service worker só registra em https ou localhost)
```

Ícones e capturas do manifest são gerados com Playwright:

```bash
NODE_PATH=$(npm root -g) node scripts/gen-icons.mjs
NODE_PATH=$(npm root -g) node scripts/gen-screenshots.mjs   # com o preview rodando na porta 4173
```

## Publicação

Qualquer hospedagem estática com HTTPS serve (o build usa caminhos relativos, funciona na raiz ou
em subpasta). `vercel.json` já está configurado; na Vercel basta importar o repositório.

## Estrutura

```
public/            manifest, service worker (sw.js) e ícones
src/lib/           estado, ações, datas, recorrência, linguagem natural, metas, sugestões,
                   notificações, PWA, autenticação
src/components/    shell, UI base, editores, assistente de metas, paleta de comandos
src/pages/         Login, Início, Tarefas, Metas, Hábitos, Lembretes, Agenda, Revisão,
                   Instalar, Configurações
src/styles/app.css design system (tokens claro/escuro, vidro líquido, layout responsivo)
```
