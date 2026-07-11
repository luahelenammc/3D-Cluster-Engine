# Changelog

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
