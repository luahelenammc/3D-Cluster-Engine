# LMS 3D Cluster Engine

Uma engine web genérica para visualizar, explorar e editar grafos 3D organizados por clusters. O renderer recebe um snapshot mutável; o dataset canônico permanece separado, validado e exportável.

## GitHub Pages

O projeto é uma SPA Vite inteiramente estática. Todo push para `main` executa lint, testes, build e publicação pelo workflow `.github/workflows/deploy-pages.yml`. No GitHub, Pages deve estar configurado com **Source: GitHub Actions**.

## O que já funciona

- renderer WebGL com órbita, zoom, foco e fit;
- posicionamento semântico tridimensional por três eixos configuráveis;
- física 3D com alvos semânticos, coesão por cluster e forças de links;
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
- undo/redo na store e na interface;
- temas dark e light e painéis responsivos;
- Neighborhood Illumination com continuidade durante drag em mouse e toque.

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

## Posicionamento semântico por três eixos

A engine não precisa espalhar nós por uma esfera pseudoaleatória. Cada dataset pode declarar três eixos independentes em `layout.axes`. O preset genérico atual usa:

- **X — Território:** ordem declarada dos clusters;
- **Y — Progressão:** campo numérico `level`, com profundidade do grafo como fallback;
- **Z — Centralidade relacional:** soma ponderada das conexões do nó.

Esses nomes são defaults, não ontologia fixa. Cada eixo pode usar uma destas fontes:

- `field`: campo numérico do nó, incluindo caminhos como `metadata.maturity`;
- `cluster`: posição estável do cluster declarado;
- `degree`, `inDegree` ou `outDegree`: conectividade derivada;
- `graphDepth`: distância estrutural calculada no grafo;
- `stableIndex`: ordem determinística por ID.

Exemplo:

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

Os alvos semânticos são calculados sobre o dataset inteiro e carregados no snapshot de runtime. Filtrar a visualização não redefine silenciosamente o significado espacial. A física continua resolvendo colisões e tensão entre links, mas a macroposição vem dos eixos.

Datasets antigos com a propriedade singular `layout.axis` continuam aceitos por uma ponte de compatibilidade.

## Importadores

- **Canonical JSON:** um arquivo no schema 1.0.
- **Split JSON:** `nodes.json`, `links.json` e, opcionalmente, `clusters.json`.
- **CSV:** `nodes.csv` e `links.csv`; colunas `meta.*` tornam-se metadata.
- **Marble:** `topics.json` e `dependencies.json`, preservando a direção `prerequisite → topic`.

Todos os arquivos são processados no navegador. Não há telemetria, upload de dataset ou backend obrigatório.

## Arquitetura

- `src/data`: validação, adapters e autoridade canônica (`GraphStore`);
- `src/core/spatial.ts`: contrato dos eixos, métricas derivadas e alvos semânticos;
- `src/renderer`: renderer e forças 3D;
- `src/ui`: interface e controller de interação;
- `src/core`: contratos e utilidades determinísticas.

A biblioteca gráfica nunca recebe o objeto canônico original. `GraphStore.getRuntimeSnapshot()` clona nós e links antes de entregá-los ao renderer.

## Limitações atuais

- edição de cluster e link existente está disponível na store, mas a interface v1 prioriza criar links e editar nós;
- importação ZIP e screenshot export não entram nesta fase;
- a fixture Marble real não é distribuída aqui; o adapter aceita os arquivos quando fornecidos pelo usuário;
- acessibilidade do espaço 3D é necessariamente parcial e é compensada por busca, filtros e inspector textual;
- datasets muito grandes podem exigir desativar partículas e reduzir pixel ratio em hardware modesto;
- guias geométricos 3D completos para os eixos ainda podem ser adicionados; a versão atual expõe legenda e configuração sem transformar o canvas numa caixa cartesiana opaca.

## Créditos

Usa `3d-force-graph`, Three.js, `d3-force-3d`, AJV, React, Vite e Vitest. O adapter Marble se baseia na taxonomia pública de [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy); nenhum dado Marble é redistribuído nesta entrega.

Licença do código ainda depende de decisão da owner. Veja `LICENSE_PENDING.md`.
