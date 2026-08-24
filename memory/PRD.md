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

### Iter 24 (2026-08-23) — Bug fix: navegação (Google Maps/Waze) do entregador
- [x] Corrigido: após aceitar a entrega, "Iniciar rota" não abria o Google Maps. Causa: seleção via `Alert.alert` (não confiável no web) e botão desabilitado quando o endereço não tinha coordenadas. Correção: **modal in-app** "Abrir navegação" com botões Google Maps/Waze (`nav-modal`, `nav-google`, `nav-waze`), botão habilita com coords OU rua, e fallback para busca por endereço textual quando não há lat/lng. Botão "Abrir navegação" reabre o modal. Verificado pelo testing_agent (backend 4/4, frontend OK, iteration_11).

### Iter 23 (2026-08-23) — ID do entregador em destaque + entregador de teste
- [x] No app do entregador, card em destaque (logo abaixo do cabeçalho) com "Seu ID de entregador" mostrando o `courier_code` em fonte grande e botão **Copiar** (expo-clipboard; muda para "Copiado!"). Facilita compartilhar o ID com o lojista.
- [x] Criado entregador de teste: nome "Entregador Teste", CPF `00000000000`, senha `00000000000`, placa ABC1234, renavam 00000000000, ID `ZF-546RT`. (E-mail não é usado no modelo do entregador; login é por CPF+senha.)

### Iter 22 (2026-08-23) — Reatribuir rápido + entregador de teste
- [x] "Reatribuir" na Fila do lojista agora abre o pedido com `?assign=1` e a tela rola automaticamente até a seção "Entregador", com destaque temporário, para escolher outro entregador de imediato.
- [x] Criado entregador de teste já vinculado/aceito ao lojista demo: Rafael Teste, CPF `99988877766`, senha `99988877766`, ID `ZF-ZMQBN`.
- [x] Bug crítico corrigido pelo testing_agent: variável `assign` duplicada (param do router + função de atribuição) causava SyntaxError e preview em branco; função interna renomeada para `assignTo`. Verificado (backend 4/4 + E2E frontend, iteration_10).

### Iter 21 (2026-08-23) — Bug fix: atribuição de entregador (detalhe do pedido)
- [x] (1) A lista de entregadores no detalhe do pedido agora mostra **nome + ID (courier_code)** e exibe apenas entregadores com vínculo **aceito**. (2) Atribuição corrigida com feedback: ao tocar no entregador, chama `assign-courier` (fluxo de oferta) com tratamento de erro (Alert) e recarrega; estados exibidos: "Oferta enviada para X — aguardando aceite" (pendente), "Aceito: X • placa (ZF-...)" (aceito) e "X recusou — escolha outro" (recusado); chip escolhido destacado. Verificado pelo testing_agent (backend 5/5, frontend ponta a ponta).

### Iter 20 (2026-08-23) — Recusa na fila do lojista
- [x] Quando o entregador recusa a oferta, o pedido guarda `courier_refused` (nome + hora) e limpa oferta/entregador. Na Fila do lojista esses pedidos sobem para o topo, ganham borda vermelha, banner "{nome} recusou — atribua a outro" e botão **Reatribuir** (abre o detalhe para escolher outro). Também mostra status do entregador no card: "Entregador: X" (aceito) e "Aguardando X aceitar…" (oferta pendente). Ao reatribuir/ofertar novamente, `courier_refused` é limpo. Testado (backend + screenshot).

### Iter 19 (2026-08-23) — Reformulação dos entregadores
- [x] Entregador agora se **auto-cadastra** na tela de login (aba Entregador → Cadastrar): nome, CPF, placa, renavam. Senha = CPF. Sistema gera **ID único ZF-XXXXX**. Login por CPF+senha (`POST /api/courier/register`, `POST /api/auth/courier-login`).
- [x] Removido o cadastro de entregadores do menu do lojista; agora o lojista **convida por ID** (`POST /api/my/couriers/invite`). O entregador **aceita/recusa o convite** (`/courier/me/invites` + respond). Vínculo por dono (owner_id) — entregador pode atender várias lojas.
- [x] Atribuição vira **oferta**: `assign-courier` cria `courier_offer` pendente (não seta courier). Entregador recebe **notificação in-app com som** (polling 8s + expo-audio `assets/sounds/beep.wav`) com nome da loja, endereço de coleta e de entrega, e **aceita/recusa** (`/courier/me/offers`, `/orders/{id}/offer-response`). Recusar devolve ao lojista.
- [x] Iniciar rota deixa **escolher Google Maps ou Waze**.
- [x] Saldo do entregador por **dia/semana/mês com quebra por loja** (nome, qtd e total por loja no período). `_earnings` agrupa por `store_name`.
- [x] Dados antigos de entregadores limpos (começar do zero). Verificado pelo testing_agent (backend 16/16, frontend fluxo completo). Obs: warnings de shadow*/pointerEvents são pré-existentes e não bloqueiam.

### Iter 18 (2026-08-19) — Bug fix
- [x] Corrigido: não era possível vincular entregador ao pedido. Causa: `PATCH /api/orders/{oid}/assign-courier` exigia que o entregador pertencesse à mesma loja do pedido; com múltiplas lojas do mesmo dono, atribuir a pedido de outra loja retornava 404. Correção: valida o entregador por qualquer loja do dono (`store_id $in owned_ids`); `/my/couriers` também alargado para todas as lojas do dono. Verificado pelo testing_agent (backend 6/6, frontend OK, incluindo loja secundária).

### Iter 17 (2026-08-19) — Bug fix
- [x] Corrigido: pedidos não apareciam para o lojista. Causa: o lojista demo possui 3 lojas, mas `GET /api/my/store/orders` e `/api/my/dashboard` usavam `find_one({owner_id})`, retornando pedidos de apenas 1 loja; pedidos das outras lojas ficavam invisíveis. Correção: ambos agregam por todas as lojas do dono (`store_id $in ids`). Melhorias UX: nome da loja em cada card da fila e estado vazio mais claro (indica total e aba Finalizado). Verificado pelo testing_agent (backend 6/6, frontend OK).

### Iter 16 (2026-08-18) — Bug fix
- [x] Corrigido: botões demo de login abriam o acesso trocado (cliente abria lojista e vice-versa). Causa: `role`/`active_role` das contas demo foram corrompidos pelo switch-role em testes. Correções: (1) reparo idempotente das contas demo em `seed_data` a cada startup (cliente→cliente, lojista→lojista); (2) `switch-role` agora ignora as contas demo (`DEMO_EMAILS`), mantendo papel fixo para não recorrer. Verificado pelo testing_agent (backend 3/3, frontend 3/3).

### Iter 15 (2026-08-18)
- [x] Tela de login com opção separada do entregador: seletor no topo "Cliente / Lojista" x "Entregador". Na aba Entregador o formulário é dedicado (dica de senha = CPF, teclado numérico, botão "Entrar como entregador", sem link de cadastro); na aba geral mantém demos Cliente/Lojista e "Cadastre-se". Mesmo endpoint de login (o backend define o papel).

### Iter 14 (2026-08-18)
- [x] Novo tipo de usuário `entregador` + login próprio. No cadastro de entregadores do lojista foi adicionado o campo **e-mail**; ao salvar, o sistema cria/atualiza uma conta de login (role entregador) com **senha = CPF**. Backend: Role inclui `entregador`; `_ensure_courier_user` no create/update; `UserOut.cpf`; endpoints autenticados `GET /api/courier/me/orders`, `GET /api/courier/me/order/{code}` (só pedidos atribuídos por CPF), `GET /api/courier/me/earnings`.
- [x] Área do entregador logado (`app/(entregador)`): roteamento por `active_role` no Gate. Aba **Entregas** (lista de pedidos atribuídos + busca por número → endereço do cliente, iniciar rota no Google Maps, acompanhamento LiveMap/OSM, finalizar entrega) e aba **Meu saldo** (dia/semana/mês + histórico de hoje). Botão Sair. Demo no login: `entregador@zappyfood.com` / senha `12345678900`. Testado E2E (login, lista, saldo).

### Iter 13 (2026-08-18)
- [x] Novo sistema de fidelidade: cliente ganha 1 ponto a cada R$ 10 gastos (antes R$ 1 = 1 ponto) e resgata em blocos de 100 pontos = R$ 2 de desconto (antes 100 pts = R$ 10). Backend: ganho `int(total//10)` ao finalizar; resgate snapa para múltiplos de 100 com valor R$ 2/bloco e cap pelo total; `/api/loyalty` mostra valor `(pts//100)*2` e taxa atualizada. Frontend: checkout (blocos de 100, mensagem quando <100 pts) e perfil com texto atualizado. Testado E2E (resgate 250→200=R$4; ganho 57,77→5 pts).

### Iter 12 (2026-08-18)
- [x] Upload de imagens (Object Storage gerenciado da Emergent) substituindo os campos de URL na área do lojista: produto (foto), loja (banner e logo). Componente `ImageUpload` abre a galeria/arquivos via `expo-image-picker`, envia ao backend e salva a URL do servidor. Backend: `POST /api/upload` (multipart, requer lojista; valida tipo/tamanho, guarda em `db.uploads`) e `GET /api/files/{path}` (leitura pública das imagens do catálogo, com cache). `init_storage` no startup; chave em `EMERGENT_LLM_KEY`. Permissão de fotos (iOS/plugin) adicionada no app.json. Testado E2E no web (galeria → upload → preview).

### Iter 11 (2026-08-18)
- [x] Histórico detalhado no "Meu saldo" da página `/entregador`: além dos totais (dia/semana/mês) e do botão Limpar, agora lista as "Entregas de hoje" com horário, código do pedido, cliente e valor (taxa de entrega). Backend `GET /api/courier/earnings` passou a retornar `day_orders` (ordenado do mais recente).

### Iter 10 (2026-08-16)
- [x] Consulta de saldo do entregador na página pública `/entregador`: alternador "Entrega" / "Meu saldo"; na aba de saldo o entregador digita o CPF e vê seus ganhos (soma das taxas de entrega dos pedidos finalizados atribuídos a ele) por Hoje, Esta semana (a partir de segunda) e Este mês. Backend público `GET /api/courier/earnings?cpf=` (fuso America/Sao_Paulo, usa horário de finalização; 404 se CPF não cadastrado).

### Iter 9 (2026-08-16)
- [x] Relatório de pagamento de entregadores (painel lojista): tela "Pagamento de Entregadores" com navegação por dia (Ontem/Hoje/data), resumo de total de entregas e total a pagar, agrupamento por entregador (nº de entregas + soma das taxas de entrega = valor a pagar) e lista expansível dos pedidos de cada entregador. Também mostra pedidos finalizados sem entregador atribuído. A taxa de entrega configurada pelo lojista é o pagamento do entregador. Backend: `GET /api/my/couriers/report?date=YYYY-MM-DD` (fuso America/Sao_Paulo, usa horário de finalização do pedido). Atalhos: card no dashboard + ícone no cabeçalho da tela de Entregadores.

### Iter 8 (2026-08-16)
- [x] Página web do entregador em `/entregador` (sem login, mobile): digita o número/código do pedido, o sistema busca e exibe o endereço do cliente. Botão "Iniciar rota" abre o Google Maps com a rota até o cliente e ativa o GPS (navigator.geolocation no web / expo-location no nativo) transmitindo a posição em tempo real. Botão "Finalizar entrega" muda o status para Entregue e notifica o cliente.
- [x] Rastreamento ao vivo com Leaflet + OpenStreetMap (via react-native-webview) — componente `LiveMap` que faz polling da posição do entregador (endpoint público) e move o marcador. O cliente vê o mapa com o entregador na tela de acompanhamento quando o pedido está "Saiu para entrega".
- [x] Backend: código curto único por pedido (`code`); endpoints públicos `/api/courier/order/{code}` (lookup), `/location` (POST/GET) e `/finish`. Rota `/entregador` liberada do gate de autenticação. Código do pedido exibido na fila do lojista e na tela de acompanhamento do cliente.

### Iter 7 (2026-08-13)
- [x] (Revertido a pedido do usuário) Notificações push reais foram implementadas e depois REMOVIDAS a pedido do usuário. Mantidos apenas os avisos in-app (sino + tela Avisos). Backend sem `/register-push`/`send_push`; `app.json` sem plugin expo-notifications/googleServicesFile; `_layout.tsx` limpo.

### Iter 6 (2026-08-13)
- [x] Confirmação de recebimento pelo cliente: quando o pedido está "Saiu para entrega", o cliente vê o botão "Confirmar recebimento" na tela de acompanhamento; ao tocar, o status vira "Entregue", os pontos são creditados e o lojista recebe a notificação "X confirmou o recebimento".
- [x] Auto-finalização: tarefa em background (roda a cada 60s) que marca automaticamente como "Entregue" pedidos em "Saiu para entrega" que passaram de 30 min do horário previsto de entrega (created_at + est_delivery_min + 30min), creditando pontos e avisando o lojista. Registrado no histórico com flag auto=true.
- [x] Permissões: cliente só pode confirmar quando status == SAIU_PARA_ENTREGA (bloqueado 403 caso contrário).

### Iter 5 (2026-08-13)
- [x] Faixas de distância: lojista pode escolher modo "valor por km" ou "faixas" (ex: 0-2km=R$5, 2-5km=R$8, 5-8km=R$12); editor de faixas nas configurações; quote e criação de pedido respeitam o modo escolhido.
- [x] Cupons/promoções por produto: tela "Cupons / Promoções" (via painel do lojista) onde o lojista escolhe o produto e define o desconto em R$; cliente vê preço antigo riscado + preço promocional + selo PROMO; pedido usa o preço com desconto.
- [x] Avisos de status (in-app): coleção de notificações; cliente recebe aviso a cada mudança de status do pedido, lojista recebe aviso de novo pedido; sino com contador de não lidas na home do cliente + tela "Avisos"; endpoints /api/notifications (list, unread_count, read_all, read). Observação: são avisos in-app (polling); push real do SO exige build + google-services.json.

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
