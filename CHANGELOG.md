## Unreleased — Second Mind 0.4 · Knowledge Compiler

- Compilação determinística de wiki cumulativa gerenciada com revisão por página, stale, backlinks, log, rollback e readback local.
- Consulta BM25 com vetores Ollama locais opcionais, resumo de continuidade e revisão de fontes.
- Temporalidade explícita (observado em versus válido desde/até) sob registro humano.
- Export Obsidian Canvas/Markdown com links resolvidos; importação limitada à seção Nota humana, que não altera o corpo compilado.
- Snapshot portátil e MCP stdio somente leitura por exportação explícita.
- Modos Explorar, Perguntar, Revisar; QA sintético e Playwright desktop/mobile.
- Sem edição de fontes por IA, sem corpus privado em CI e sem mudança do contrato GraphDataset 1.1.

# Changelog

## Unreleased — Knowledge Engine / Second Mind 0.3 (2026-11-06)

- registro de afirmações com evidência, autoridade documental e revisão, preservando citações no aceite de links canônicos;
- chunking Markdown e planejamento incremental com hashes; integração semântica opt-in com propostas governadas;
- reconciliação de aliases e contradições apenas como candidatos;
- query packet v2 com busca local lexical/topológica, pathfinder dirigido e abstinência quando não houver evidências;
- diagnósticos de comunidades, pontes e interclusters, camadas 3D/2D, inspector de provas e LOD reversível;
- exportações Obsidian Canvas/Markdown e GraphML, prévia não confiável de graph.json do Graphify;
- novos contratos JSON Schema, testes sintéticos, QA de browser desktop/mobile e documentação de privacidade;
- sem novo renderer, dependências Graphify ou uploads automáticos do corpus privado.

## 0.2.1 — 2026-10-02

- separação entre seleção leve e abertura deliberada do inspector, com resumo do nó e drawer móvel que preserva a seleção ao fechar;
- arrasto seleciona o nó, rejeita clique pós-drag como duplo clique e amplia o alvo de raycast sem inflar a esfera visível;
- rótulos por prioridade, orçamento adaptativo por zoom e controle único `Essenciais / Contexto / Mais`, com orçamento ampliado em 2D;
- writeback Markdown direto por handle do File System Access, permissão solicitada somente na ação Aplicar, bloqueio de conflito por fingerprint e releitura de confirmação;
- exportação de patch mantida como fallback, histórico registra o fingerprint de fonte atualizado e o Second Mind recolhe configuração avançada de IA;
- GraphDataset 1.1 permanece compatível; acrescentados testes de transições de interação, conflito, permissão e verificação de escrita.

## Unreleased — Dataset Publishing Protocol 1.0

- registry público e versionado em `public/datasets/registry.json`;
- JSON Schema estrito para entradas de datasets publicados;
- seletor de projetos na superfície pública;
- abertura direta por query parameter `?dataset=<id>`;
- validação do registry e do dataset antes da importação;
- fallback seguro para o demo quando o registry não pode ser aberto;
- protocolo universal de ingestão, lineage, fixture, QA, publicação e confirmação de deploy;
- testes para resolução, caminhos seguros, IDs duplicados e dataset padrão.

## Unreleased — Data Contract 1.1

- schema canônico elevado de 1.0 para 1.1;
- JSON Schema público completo tornou-se a única fonte estrutural usada pelo runtime;
- `clusters` passou a ser obrigatório no corpo canônico;
- IDs estáveis passaram a ser obrigatórios para links canônicos;
- camada explícita de normalização e migração 1.0 → 1.1;
- geração determinística de IDs para links legados e estrangeiros;
- migração de `layout.axis` para `layout.axes`;
- validação ampliada para duplicidade de clusters/nós/links, referências, cobertura dos eixos, isolamento, densidade, tamanho e envelope de performance;
- roundtrip canônico validado antes da exportação;
- split JSON ganhou sidecars de meta, layout, visual e extensions;
- CSV ganhou clusters opcionais, metadata aninhada tipada, tags e posições baked;
- fixtures válidas, legadas e quebradas, além de testes de migração, roundtrip e escala;
- matriz de compatibilidade, guia de contrato e política de versão;
- workflow de validação para branches e pull requests.

## 0.1.0 — 2026-07-11

- primeiro renderer 3D genérico;
- contrato canônico, schema e validação semântica;
- GraphStore com histórico e separação source/runtime;
- cluster force, axis force, posições determinísticas e bake;
- interface de exploração e edição;
- adapters canonical, split JSON, CSV e Marble;
- exportação e autosave local;
- testes, documentação, responsividade e temas;
- distribuição estática Vite e workflow de GitHub Pages após falha do runtime Worker original;
- correção do layout mobile para iniciar com o canvas livre e manter os drawers mutuamente exclusivos;
- Neighborhood Illumination v0.2: hover/touch contextual, halo, links incidentes iluminados e labels hierárquicos para o nó central e sua vizinhança;
- continuidade da Neighborhood Illumination durante arrasto por prioridade `dragged > selected > hovered`;
- Semantic Axes v0.3: macroposição determinada por três eixos configuráveis, com defaults Território × Progressão × Centralidade relacional, métricas derivadas, fallback compatível e controles na interface.
