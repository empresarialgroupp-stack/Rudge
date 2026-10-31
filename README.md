# Rudge

Sistema pessoal de organização — tarefas, metas, hábitos e lembretes com notificações.
PWA instalável no computador (Chrome/Edge/Safari) e no celular (Android/iPhone), design
"liquid glass" monocromático com modo escuro e **modo white**.

## Acesso

Conta Rudge: a mesma do Rudge Music (Supabase Auth do projeto `rudge`). Login por e-mail: link de
acesso (volta para o app com a sessão no endereço) ou código de 6 dígitos, quando o modelo de e-mail
tiver `{{ .Token }}` (exige SMTP próprio no Supabase). Só contas existentes entram (a conta nasce por
convite). `src/lib/auth.ts`

- No iPhone, o link abre no Safari, que tem armazenamento separado do app instalado: no app instalado
  o login precisa do código. Administradores (`public.is_admin()`) usam o app qualquer que seja o plano.

- Depois do login o servidor de avisos emite um **token deste aparelho** (`/device`), usado pelo app e
  pelo service worker com o app fechado. Só o hash fica no banco (`rudge.device_tokens`).
- No primeiro login de quem usava a senha antiga, os avisos do dono antigo (`owner`) passam para a
  conta e a senha antiga deixa de valer (`rudge.legacy_claim`).
- **Plano**: o app consulta `public.my_access()` e só bloqueia quando o plano não inclui o Rudge app
  (sem resposta do servidor, segue liberado). `src/lib/access.ts`
- **Integrações** (Configurações → Conta e integrações): conectar o Rudge Music (`public.integrations`)
  e atalho para ele no modo foco. Os dois continuam apps separados.

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
- **Plano do dia automático**: 3 prioridades (metas atrasadas, tarefas vencidas, alta prioridade)
  e tarefas encaixadas nos horários livres entre lembretes e compromissos; aviso da manhã com
  botão "Aceitar plano" (funciona com o app fechado). `src/lib/planner.ts`
- **Horários aprendidos**: registra quando você conclui/adia; sugere mudar lembretes recorrentes e
  hábitos para o horário real. `src/lib/insights.ts`
- **Modo foco**: cronômetro em tela cheia, avisos em silêncio (guardados na central; pushes chegam
  sem som), sessões somadas às metas (metas em horas/min recebem os minutos). `src/lib/focus.ts`
- **Metas que se recalculam**: novo ritmo, novo prazo pelo ritmo real e "quebrar em etapas" com
  valor (marcadas sozinhas ao atingir). `recalcGoal` em `src/lib/goals.ts`
- **Diário de 1 minuto** (`#/diario`): o que deu certo, o que travou, nota 1–5; gráfico e hábitos
  que combinam com os melhores dias.
- **Captura por foto**: OCR no próprio aparelho (Tesseract, arquivos em `/ocr`, sem CDN);
  boletos pela linha digitável (valor e vencimento, dígitos conferidos). `src/lib/scan.ts`
- **Lembrete por lugar**: lugares salvos em Configurações; "quando sair do trabalho". Funciona com
  o app aberto ou ao abrir (navegadores não acompanham a localização com o app fechado). `src/lib/geo.ts`
- **Retrospectiva do mês**: telas animadas no dia 1, imagem para compartilhar. `src/lib/retro.ts`
- **Carteira** (`#/carteira`): pilha de cartões animada (arraste, setas ou toque para abrir) e,
  abaixo do cartão aberto, quanto entrou, quanto saiu, dicas e o aviso de guardar 10% de cada
  entrada. Importa extratos OFX/CSV de Nubank, Inter e Mercado Pago no próprio aparelho (sem senha
  de banco); Open Finance automático em `docs/open-finance.md`.
- **Agenda** mensal, **Revisão semanal** guiada, paleta de comandos (`Ctrl/⌘ K`), atalho `N`
  para adicionar, backup/importação em JSON.

### Linguagem natural (pt-BR)

`hoje`, `amanhã`, `depois de amanhã`, `sexta`, `dia 15`, `15/11`, `20 de outubro`,
`às 9h`, `14:30`, `8 da noite`, `à tarde`, `em 20 min`, `daqui a 2 horas`, `todo dia`,
`dias úteis`, `toda segunda e quarta`, `todo dia 5`, `!!!` (prioridade), `#saude` (área).

## Notificações

**Com o app aberto/minimizado** o motor local (`src/lib/scheduler.ts`) monta a fila de avisos —
lembretes, tarefas com horário, hábitos, check-ins e prazos de metas, resumo da manhã, fechamento
do dia e revisão semanal — e mostra aviso interno (em foco) ou notificação do sistema.

**Com o app fechado** o aviso vem do servidor (Web Push):

```
app (cada aparelho) ──/subscribe──▶ Edge Function "rudge" ◀── pg_cron (a cada minuto) → /dispatch
        └──/sync (fila dos próximos 30 dias)──▶ rudge.notifications ──push──▶ service worker → notificação
```

- Servidor: Supabase (projeto `rudge`, região São Paulo). Função em `supabase/functions/rudge`,
  migrações em `supabase/migrations`. Dados no schema `rudge`, que não é exposto pela API.
- Autenticação: o login gera um token derivado da senha (a senha não é guardada); o servidor
  guarda só o hash do token. Chaves VAPID e segredos ficam no Vault do Supabase.
- Os botões **Concluir/Adiar** funcionam com o app fechado: o service worker avisa o servidor
  (adiar reagenda o push) e o app aplica a mudança quando abrir.
- Sem duplicar: com o app em foco o push vira aviso interno; o registro de disparos é
  compartilhado entre app e service worker.
- Vários aparelhos: os dados ficam em cada aparelho, então vale a fila do aparelho com a
  **edição mais recente** (`editedAt`, tabela `rudge.owners`). Um aparelho desatualizado não
  programa nada — evita lembrete em horário antigo ou já concluído. Uma assinatura por aparelho.
- No iPhone, todo push exibe uma notificação (mesmo com o app aberto, uma silenciosa que fecha
  sozinha): o Safari cancela a assinatura de sites que recebem push sem mostrar nada.
- `owner_id` já existe nas tabelas para a futura versão multiusuário (SaaS).

Teste: Configurações → Notificações → **Testar com o app fechado** (aviso em ~1 minuto).

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes (interpretador, recorrência, fila de notificações, hash)
# servidor: supabase functions deploy rudge --no-verify-jwt  (projeto btpbarqvsglqzpcpezvz)
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
