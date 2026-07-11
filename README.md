# LMS 3D Cluster Engine

Uma engine web genérica para visualizar, explorar e editar grafos 3D organizados por clusters. O renderer recebe um snapshot mutável; o dataset canônico permanece separado, validado, migrável e exportável.

## GitHub Pages

O projeto é uma SPA Vite inteiramente estática. Todo push para `main` executa lint, testes, build e publicação pelo workflow `.github/workflows/deploy-pages.yml`. Pull requests e branches de trabalho passam por `.github/workflows/validate.yml`.

## O que já funciona

- renderer WebGL com órbita, zoom, foco e fit;
- posicionamento semântico tridimensional por três eixos configuráveis;
- física 3D com alvos semânticos, coesão por cluster e forças de links;
- cores estáveis por ID de cluster;
- busca, filtros, seleção, vizinhança e inspector;
- edição de nós e metadata; criação e exclusão de nós e links;
- Neighborhood Illumination com continuidade durante drag em mouse e toque;
- contrato canônico estrito 1.1 com JSON Schema público completo;
- normalização explícita de formatos externos e migração 1.0 → 1.1;
- importação de JSON canônico, split JSON, CSV e bundle Marble;
- exportação para JSON canônico com validação antes da serialização;
- layout live, hybrid e baked;
- autosave local, undo/redo, temas e painéis responsivos.

## Quick start

```bash
npm install
npm run dev
```

Validação:

```bash
npm run lint
npm run test
npm run build
```

## Contrato dos dados

O schema público e soberano está em `schema/graph-dataset.schema.json`. O contrato vigente é `1.1`:

```json
{
  "schemaVersion": "1.1",
  "meta": { "id": "meu-grafo", "title": "Meu grafo", "version": "1.0.0" },
  "clusters": [{ "id": "a", "label": "Cluster A" }],
  "nodes": [{ "id": "n1", "label": "Nó 1", "cluster": "a" }],
  "links": []
}
```

Leis principais:

- `clusters` é sempre obrigatório;
- todo nó referencia um cluster declarado;
- todo link possui `id`, `source` e `target` estáveis;
- propriedades estruturais desconhecidas são rejeitadas;
- extensões de projeto vivem em `extensions` ou `metadata`;
- arquivos 1.1 são estritos e nunca são silenciosamente reparados;
- arquivos 1.0 são aceitos apenas pela camada de migração.

Documentação completa:

- `docs/DATA_CONTRACT.md`;
- `docs/COMPATIBILITY_MATRIX.md`;
- `docs/MIGRATION_1.0_TO_1.1.md`.

## Pipeline externo → interno

```text
formato externo
  → adapter
  → draft permissivo
  → normalização e relatório de migração
  → GraphDataset canônico 1.1
  → GraphStore
  → RuntimeGraph clonado
  → renderer
```

O renderer nunca recebe o objeto canônico original. `GraphStore.getRuntimeSnapshot()` clona nós e links, calcula `semanticTarget` e só então entrega o corpo mutável à biblioteca gráfica.

## Posicionamento semântico por três eixos

Cada dataset pode declarar três eixos independentes em `layout.axes`. O preset genérico usa:

- **X — Território:** ordem declarada dos clusters;
- **Y — Progressão:** campo numérico `level`, com profundidade do grafo como fallback;
- **Z — Centralidade relacional:** soma ponderada das conexões do nó.

Fontes disponíveis: `field`, `cluster`, `degree`, `inDegree`, `outDegree`, `graphDepth`, `stableIndex`.

```json
{
  "layout": {
    "axes": {
      "enabled": true,
      "x": { "enabled": true, "source": "cluster", "label": "Território" },
      "y": { "enabled": true, "source": "field", "field": "level", "label": "Progressão", "missing": "graphDepth" },
      "z": { "enabled": true, "source": "degree", "label": "Centralidade relacional" }
    }
  }
}
```

Os alvos são calculados sobre o dataset inteiro. Filtrar a visualização não redefine silenciosamente o significado espacial.

## Importadores

- **Canonical JSON 1.1:** estrito e full-fidelity.
- **Canonical JSON 1.0:** migrado para 1.1 com relatório.
- **Split JSON:** `nodes.json`, `links.json` e sidecars opcionais `clusters.json`, `meta.json`, `layout.json`, `visual.json`, `extensions.json`.
- **CSV:** `nodes.csv`, `links.csv`, `clusters.csv` opcional e sidecars JSON; `meta.*` suporta tipos e caminhos aninhados.
- **Marble:** `topics.json` e `dependencies.json`, preservando a direção `prerequisite → topic`.

Todos os arquivos são processados no navegador. Não há telemetria, upload de dataset ou backend obrigatório.

## Envelope de performance declarado

| Superfície | Nós | Links |
|---|---:|---:|
| Mobile recomendado | 750 | 2.500 |
| Desktop recomendado | 2.000 | 8.000 |
| Fronteira de stress | 5.000 | 20.000 |

Acima do envelope desktop, a validação emite warnings. Acima da fronteira de stress, responsividade não é prometida sem level of detail, agregação e degradação visual.

## Arquitetura

- `schema`: contrato público único;
- `src/data/normalize.ts`: migração e alfândega;
- `src/data/adapters.ts`: dialetos externos;
- `src/data/validate.ts`: validação estrutural, semântica e de escala;
- `src/data/graph-store.ts`: autoridade canônica e histórico;
- `src/core/spatial.ts`: eixos, métricas derivadas e alvos semânticos;
- `src/renderer`: renderer e forças 3D;
- `src/ui`: interface e controller de interação;
- `tests/fixtures`: corpos válidos, legados e deliberadamente quebrados.

## Limitações atuais

- edição de cluster e link existente está disponível na store, mas a interface prioriza criar links e editar nós;
- importação ZIP e screenshot export ainda não entram nesta fase;
- a fixture Marble real não é redistribuída;
- acessibilidade do espaço 3D é parcial e compensada por busca, filtros e inspector textual;
- guias geométricos 3D completos para os eixos ainda podem ser adicionados;
- datasets acima do envelope declarado exigem QA em hardware-alvo.

## Créditos

Usa `3d-force-graph`, Three.js, `d3-force-3d`, AJV, React, Vite e Vitest. O adapter Marble se baseia na taxonomia pública de `withmarbleapp/os-taxonomy`; nenhum dado Marble é redistribuído nesta entrega.

Licença do código ainda depende de decisão da owner. Veja `LICENSE_PENDING.md`.
