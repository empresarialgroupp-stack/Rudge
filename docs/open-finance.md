# Carteira: conexão com os bancos (Open Finance)

A Carteira mostra dados de exemplo até o primeiro extrato importado. A fonte dos dados é
escolhida em um único ponto: `getProvider()` em `src/lib/finance/index.ts`.

## Hoje: importar extrato (grátis, sem senha de banco)

Na Carteira → **Importar**. Lê OFX e CSV de Nubank (conta e
fatura), Inter, Mercado Pago e outros bancos (`src/lib/finance/importer.ts`). O arquivo é lido
no aparelho e as contas ficam no `localStorage` (`rudge.wallet.accounts.v1`). Reimportar não
duplica. Pagamento de fatura não conta como gasto (as compras já contam no cartão) nem como
entrada. Entradas abaixo de R$ 20 não entram na regra dos 10%.

Limite conhecido: transferência entre as próprias contas aparece como entrada em uma e saída
na outra.

## Custo do Open Finance automático

- Planos comerciais dos agregadores (Pluggy, Belvo) custam milhares de reais por mês: servem
  para apps com muitos usuários, não para uso pessoal.
- Caminho grátis para uso pessoal: **Meu Pluggy** (meu.pluggy.ai), app gratuito onde a pessoa
  conecta os próprios bancos via Open Finance; o desenvolvedor lê esses dados pela API com o
  conector MeuPluggy. O painel de desenvolvedor tem teste de 15 dias; relatos indicam que o
  conector continua funcionando depois, mas a Pluggy pode mudar as regras.

## Agregador recomendado: Pluggy

- Brasileiro, conecta via Open Finance os principais bancos (Itaú, Bradesco, Santander, BB,
  Caixa, Nubank, Inter, C6 e outros) com consentimento do próprio usuário.
- Tem widget pronto de conexão (Pluggy Connect) e ambiente de testes gratuito.
- Alternativa: Belvo (mais focado em empresas e América Latina como um todo).

## Como fica a arquitetura

```
app ──/finance/connect-token──▶ Edge Function (Supabase) ──▶ Pluggy API
 │  abre o Pluggy Connect com o token, o usuário autoriza no banco
 └─/finance/cards──▶ Edge Function ──▶ contas, cartões e transações ──▶ FinanceCard[]
```

- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` ficam como secrets do Supabase. Nunca no repositório
  nem no front.
- O app só guarda o `itemId` da conexão; as transações vêm do servidor.
- Só os 4 últimos dígitos do cartão chegam ao app.

## Passos para ligar

1. Criar conta em pluggy.ai e gerar as credenciais de teste.
2. Salvar as credenciais como secrets do Supabase.
3. Adicionar as rotas `/finance/*` na função `rudge` e um `pluggyProvider` que implemente
   `FinanceProvider.listCards()` mapeando contas/transações para `FinanceCard`.
4. Testar no ambiente de testes da Pluggy, depois trocar para produção.

## Wallet stack da Arc Pro

`src/components/WalletStack.tsx` é uma versão própria com a mesma API do Wallet stack da Arc
Pro. Com o plano Pro, `npx shadcn@latest add @uiarc-pro/wallet-stack` (com `ARC_PRO_TOKEN` no
ambiente, nunca no repositório) e trocar o import em `src/pages/Wallet.tsx`.
