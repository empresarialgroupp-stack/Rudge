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
- Caminho grátis para uso pessoal: **Meu Pluggy** (abaixo).

## Sincronização automática: Meu Pluggy (grátis, uso pessoal)

Meu Pluggy é gratuito para uso pessoal (até 5 conexões, sem prazo de teste) e atualiza os bancos a
cada 24 h. A autorização de cada banco vale 1 ano (`consentExpiresAt`); a Carteira avisa 30 dias
antes. Guia oficial: https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use.md

```
app ──x-rudge-token──▶ função "finance" (Supabase) ──▶ api.pluggy.ai
                         rudge.finance_links: item_ids, client_id, secret (Vault), último retrato
```

- `supabase/functions/finance`: `/link` (valida e salva), `/cards` (cache de 20 min no servidor),
  `/unlink`. Conversão Pluggy → Carteira em `map.ts` (testada no Vitest).
- App (`src/lib/finance/pluggy.ts`): sincroniza ao abrir, ao voltar para o app e a cada 30 min, com
  o último retrato em cache para abrir na hora.
- Sem a função publicada, o app segue com extratos importados ou dados de exemplo.

### Publicar

```bash
supabase db push                                   # tabela rudge.finance_links
supabase functions deploy finance --no-verify-jwt  # projeto btpbarqvsglqzpcpezvz
```

### Credenciais no servidor (recomendado)

Equivalente ao `process.env` do exemplo da Pluggy: em Supabase → Edge Functions → Secrets, crie
`PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`. A função passa a criar o Connect Token
(`/connect-token`, como o `app/api/connect-token/route.ts` do exemplo em Next.js) e o app só abre
o widget Pluggy Connect (`pluggy-connect-sdk`, carregado sob demanda); cada item conectado se soma
aos já salvos. As credenciais nunca passam pelo navegador.

### Conectar (uma vez)

1. meu.pluggy.ai: criar conta e conectar Nubank, Inter e Mercado Pago.
2. dashboard.pluggy.ai (mesma conta): criar aplicação, copiar Client ID e Client Secret.
3. Aplicação → Demo → Connect Account → MeuPluggy. Copiar os Item IDs em Connected Items.
4. Rudge → Carteira → Conectar: com os secrets configurados, tocar em **Abrir Pluggy** e escolher
   MeuPluggy; sem eles, colar Client ID, Client Secret e Item IDs.

## Wallet stack da Arc Pro

`src/components/WalletStack.tsx` é uma versão própria com a mesma API do Wallet stack da Arc
Pro. Com o plano Pro, `npx shadcn@latest add @uiarc-pro/wallet-stack` (com `ARC_PRO_TOKEN` no
ambiente, nunca no repositório) e trocar o import em `src/pages/Wallet.tsx`.
