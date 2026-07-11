# LMS 3D Cluster Engine

Uma engine web genérica para visualizar, explorar e editar grafos 3D organizados por clusters. O renderer recebe um snapshot mutável; o dataset canônico permanece separado, validado e exportável.

## GitHub Pages

O projeto é uma SPA Vite inteiramente estática. Todo push para `main` executa lint, testes, build e publicação pelo workflow `.github/workflows/deploy-pages.yml`. No GitHub, Pages deve estar configurado com **Source: GitHub Actions**.

## O que já funciona

- renderer WebGL com órbita, zoom, foco e fit;
- física 3D com atração por cluster e axis force por campo numérico;
- cores estáveis por ID de cluster;
- busca por ID, label, cluster, tags e metadata;
- filtros por cluster e tipo de relação;
- seleção, vizinhança e inspector;
- edição real de nós e metadata;
- criação e exclusão de nós e links;
- validação estrutural com AJV e validações semânticas;
- importação de JSON canônico, split JSON, CSV e bundle Marble;
- exportação para JSON canônico;
- layout live, hybrid e baked;
- autosave local e restauração explícita;
- undo/redo na store (API pronta; atalhos de interface entram no próximo ciclo);
- temas dark e light e painéis responsivos.

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

O schema público está em `schema/graph-dataset.schema.json`. Um dataset precisa de:

```json
{
  "schemaVersion": "1.0",
  "meta": { "id": "meu-grafo", "title": "Meu grafo", "version": "1.0.0" },
  "clusters": [{ "id": "a", "label": "Cluster A" }],
  "nodes": [{ "id": "n1", "label": "Nó 1", "cluster": "a" }],
  "links": []
}
```

O dataset demo em `public/datasets/demo/dataset.json` é externo ao renderer e pode ser editado sem alterar TypeScript.

## Importadores

- **Canonical JSON:** um arquivo no schema 1.0.
- **Split JSON:** `nodes.json`, `links.json` e, opcionalmente, `clusters.json`.
- **CSV:** `nodes.csv` e `links.csv`; colunas `meta.*` tornam-se metadata.
- **Marble:** `topics.json` e `dependencies.json`, preservando a direção `prerequisite → topic`.

Todos os arquivos são processados no navegador. Não há telemetria, upload de dataset ou backend obrigatório.

## Arquitetura

- `src/data`: validação, adapters e autoridade canônica (`GraphStore`);
- `src/renderer`: renderer e forças 3D;
- `src/ui`: interface e controller de interação;
- `src/core`: contratos e utilidades determinísticas.

A biblioteca gráfica nunca recebe o objeto canônico original. `GraphStore.getRuntimeSnapshot()` clona nós e links antes de entregá-los ao renderer.

## Limitações atuais

- edição de cluster e link existente está disponível na store, mas a interface v1 prioriza criar links e editar nós;
- importação ZIP e screenshot export não entram nesta fase;
- a fixture Marble real não é distribuída aqui; o adapter aceita os arquivos quando fornecidos pelo usuário;
- acessibilidade do espaço 3D é necessariamente parcial e é compensada por busca, filtros e inspector textual;
- datasets muito grandes podem exigir desativar partículas e reduzir pixel ratio em hardware modesto.

## Créditos

Usa `3d-force-graph`, Three.js, `d3-force-3d`, AJV, React, Vinext/Vite e Vitest. O adapter Marble se baseia na taxonomia pública de [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy); nenhum dado Marble é redistribuído nesta entrega.

Licença do código ainda depende de decisão da owner. Veja `LICENSE_PENDING.md`.
