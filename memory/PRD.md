# ZappyFood — PRD

## Original Problem Statement
Plataforma SaaS de delivery por assinatura (ZappyFood) para pequenos e médios negócios, sem comissão por pedido, modelo de assinatura mensal (R$99) / anual (R$1000) com 7 dias grátis. App cliente + app lojista + (painel admin) + backend + PostgreSQL + Supabase + FCM + Asaas.

## Adaptation to Emergent stack (agreed with user)
- Stack: **FastAPI + MongoDB + React Native/Expo** (adapted from NestJS/PostgreSQL, mantendo toda a lógica).
- **Single app** with role switch: Cliente ↔ Lojista.
- Payments **mocked** (Pix / Cartão / Dinheiro registram método, sem cobrança real).
- Auth: **JWT** (email + senha, access + refresh token, bcrypt).
- Chat básico in-app por pedido (polling, sem push).

## Architecture
- Backend: `/app/backend/server.py` — FastAPI, Motor (MongoDB), JWT auth, seed on startup.
- Frontend: Expo Router file-based routing.
  - `app/(auth)` — sign-in, sign-up
  - `app/(customer)` — index (home), search, orders, profile, store/[id], checkout, track/[id], chat/[id]
  - `app/(lojista)` — index (dashboard), queue, products, settings, order/[id]
  - `src/auth/AuthContext.tsx` — session state + role switch
  - `src/store/cart.tsx` — client-side cart
  - `src/lib/api.ts` — API client with token refresh
  - `src/theme.ts` — design tokens (orange #FF5A00 + white)

## User Personas
- **Cliente**: busca lojas, monta carrinho, faz checkout, acompanha pedido, conversa com a loja.
- **Lojista**: gerencia loja/produtos, recebe e avança pedidos, conversa com clientes, vê métricas.

### Iter 4 (2026-08-13)
- [x] Taxa de entrega automática por distância (modelo iFood/Uber Eats): `taxa = máx(taxa_mínima, taxa_base + km × valor_por_km)`, distância por Haversine × fator de rota 1.3 entre coordenadas da loja e do endereço do cliente. Respeita raio de atendimento (bloqueia pedidos fora da área com HTTP 400) e frete grátis acima de X. Endpoint POST /api/delivery/quote para prévia ao vivo no checkout; cálculo autoritativo no servidor ao criar pedido. Lojista configura taxa base, valor/km, raio e localização (GPS) nas configurações da loja. Endereços do cliente capturam lat/lng via GPS, BrasilAPI CEP v2 e geocoding.

### Iter 3 (2026-08-13)
- [x] Acompanhamento de pedido em tempo real aprimorado: card-herói com ícone e descrição do status atual, tempo estimado de chegada (ETA) e horário previsto, barra de progresso, timeline com horário de cada etapa (recebido → aceito → em preparo → saiu para entrega → entregue), animação de pulso na etapa ativa e endereço de entrega. Atualiza automaticamente a cada 4s.

## Implemented (2026-08-12)
### Iter 2 (2026-08-13)
- [x] Endereços reais: cadastro múltiplo, busca por CEP (ViaCEP), captura por GPS (expo-location), definir principal, excluir; seleção obrigatória no checkout
- [x] Variações (tamanho/sabor com preço adicional) e adicionais (ingredientes extras com preço próprio): lojista cria/edita no produto; cliente escolhe em modal de personalização com preço ao vivo
- [x] Fidelidade real: ganha pontos ao finalizar pedido (R$1 = 1 pt), resgata no checkout (100 pts = R$10) com guarda contra crédito duplo e estorno ao cancelar

- [x] Auth JWT (register, login, refresh, me, switch-role) + demo seed accounts
- [x] Cliente: home com lojas + filtro por categoria, busca, detalhe da loja com produtos, carrinho, checkout (Pix/Cartão/Dinheiro), acompanhamento com timeline de status, avaliação, favoritos (UI placeholder), fidelidade (UI)
- [x] Lojista: dashboard com métricas (receita hoje, pedidos, ticket médio, ativos), fila de pedidos com avanço de status, CRUD de produtos, configuração da loja + status (aberta/pausa/fechada/férias), assinatura (UI)
- [x] Chat por pedido (cliente ↔ lojista, polling)
- [x] Pedidos: fluxo completo AGUARDANDO_CONFIRMACAO → ACEITO → EM_PREPARO → SAIU_PARA_ENTREGA → FINALIZADO / CANCELADO
- [x] Cupons (backend: percentual/fixo/frete grátis aplicado no pedido)
- [x] Testado E2E (27/27 backend pytest + frontend flows)

## Backlog (prioritized)
### P0
- Endereços reais (GPS / CEP) — atualmente placeholder no checkout
### P1
- Integração real de pagamento/assinatura (Asaas ou Stripe)
- Push notifications (FCM / Emergent-managed) para eventos do pedido
- Variações de produto (tamanhos/sabores) e adicionais com preço
- Favoritos persistidos + fidelidade com acúmulo/resgate de pontos
### P2
- Painel administrativo (web) — gestão de lojas, financeiro, categorias, suporte
- Upload de imagens (object storage) em vez de URL
- Faixas de entrega por raio, horário de funcionamento

## Test Credentials
See `/app/memory/test_credentials.md`.
