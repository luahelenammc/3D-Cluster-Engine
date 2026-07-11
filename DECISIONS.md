# Architecture Decisions

## ADR-001 — Usar 3d-force-graph

status: accepted  
context: câmera, picking, controles orbitais e renderização WebGL não são o diferencial da engine.  
decision: usar `3d-force-graph` sobre Three.js e d3-force-3d.  
consequences: menos código autoral de baixo nível; bundle de cliente maior.  
alternatives_rejected: renderer WebGL próprio e canvas 2D.

## ADR-002 — Preservar fonte canônica fora do renderer

status: accepted  
context: as bibliotecas de força mutam nós e endpoints.  
decision: `GraphStore` mantém o dataset e entrega clones `RuntimeGraph`.  
consequences: exportação limpa e roundtrip previsível; custo controlado de clonagem por atualização editorial.  
alternatives_rejected: entregar arrays canônicos diretamente à biblioteca.

## ADR-003 — Adaptar a preferência sem framework ao runtime Sites

status: accepted  
context: o destino de execução governa um starter Vinext/React; substituí-lo comprometeria o ciclo de publicação.  
decision: usar React apenas na interface, mantendo data layer e renderer em módulos independentes e portáveis.  
consequences: a implementação concreta diverge da preferência inicial por HTML/TypeScript puro, sem romper a tríade arquitetural.  
alternatives_rejected: abandonar Sites ou manter um segundo app Vite duplicado.

## ADR-004 — Local-first sem banco

status: accepted  
context: datasets podem conter material privado e a primeira versão não exige colaboração.  
decision: importação, edição, autosave e exportação no navegador; nenhum endpoint de dados.  
consequences: privacidade simples e portabilidade; colaboração e sync ficam fora de escopo.

## ADR-005 — Distribuir como SPA estática no GitHub

status: accepted  
context: a primeira publicação via Worker do ChatGPT Sites retornou erro 1101 em produção. A engine não depende de SSR, backend ou bindings.  
decision: usar Vite + React no navegador, `base: './'` e GitHub Pages por Actions.  
consequences: hospedagem portátil e sem Worker; URLs profundas não são necessárias porque o produto possui uma única rota.  
alternatives_rejected: manter o Worker defeituoso ou adicionar outro servidor sem necessidade.
