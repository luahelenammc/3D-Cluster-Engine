# Ficha de ingestão — As Crônicas de Líthia (ACL)

## Identidade pública

- **project_id:** `acl`
- **dataset_id:** `acl`
- **título público:** As Crônicas de Líthia — organismo-multiverso
- **descrição pública:** mapa espacial sanitizado de ACL, cobrindo fontes, cosmologia, magia, Lúmens, territórios, Feras, Sombras, instituições, conflitos e formas narrativas.
- **protocolo:** Dataset Publishing Protocol 1.0
- **contrato canônico:** schema 1.1
- **versão do dataset:** 1.0.0
- **versão temporal do corpus:** consolidado até 2026-07-11
- **privacidade:** público sanitizado

## Jurisdição das fontes

Acesso não equivale a autoridade. A ordem usada nesta ingestão foi:

1. `[ACL] Worldbuilding (documento prioritário)` — parâmetros de mundo, sem rigidez linear;
2. `[ACL] Meta-writing e planejamento` — conflitos, doutrina narrativa e patches atuais;
3. `[ACL] Manuscritos de Líthia` — fragmentos multiversais e paratextos, sem governo automático do cânone;
4. `Líthia Engine V012` — modos de realidade, canonicidade, ecologia metafísica e conversão para narrativa;
5. `ACL IMAGE GENERATOR V2` — linguagem visual e motivos, sem autoridade sobre regras de mundo;
6. `threads antigas` — memória/legado, nunca governo automático do presente;
7. contexto atual do projeto ACL — identidade, soberania e decisões recentes ratificadas.

## Decisão ontológica

### O que é nó

Um nó representa uma unidade identificável e útil quando isolada:

- fonte ou engine local;
- lei cosmológica ou mágica;
- Lúmen, entidade, espécie ou classe de agentes;
- território, instituição ou sistema político;
- objeto, artefato ou interface dimensional;
- conflito, profecia, mandato, arco ou dispositivo de trama;
- forma narrativa ou motivo recorrente.

Heading, frase ou nome citado uma única vez não virou nó automaticamente. Elementos contraditórios só entraram quando possuíam função estrutural e foram marcados como `fragment-multiversal`, `sandbox`, `legacy` ou `provisional`.

### O que é link

Um link representa relação declarada ou derivação estrutural conservadora, entre elas:

- contém, governa, instancia ou protege;
- canaliza, manifesta, transforma-se em ou é variante de;
- contamina, caça, financia, neutraliza ou trata;
- exige, responde a, desencadeia, previne ou provoca;
- simboliza, visualiza, produz ou preserva.

Proximidade textual/espacial não cria relação. Links inferidos recebem `metadata.evidence: inferred`; a maioria desta versão é `declared`.

### O que é cluster

Clusters são dez bacias explicáveis do projeto:

1. Projeto, fontes e metawriting
2. Cosmologia e organismo-multiverso
3. Magia, Domínios e artefatos
4. Lúmens e forças arquetípicas
5. Territórios, reinos e espaços vivos
6. Feras, natureza e ecologia mágica
7. Sombras, OutWorld e contaminação
8. Instituições, ordens e poder
9. Conflitos, profecias e arcos
10. Manuscritos, formas e motivos

## Direção e peso

- **directed:** `true` por padrão; indica fluxo de autoridade, composição, causalidade declarada, transformação, ameaça, proteção ou produção.
- **weight 3:** relação load-bearing; removê-la muda a leitura estrutural.
- **weight 2:** relação importante para navegação e coerência.
- **weight 1:** ponte, detalhe de uma realidade, influência secundária ou derivação conservadora.

O peso não mede verdade, qualidade literária, poder mágico, importância moral ou grau de cânone.

## Tamanho dos nós

`value` representa importância load-bearing para compreender e navegar ACL.

Não representa:

- poder de combate;
- bondade ou maldade;
- popularidade;
- centralidade calculada;
- canonicidade;
- quantidade de texto no corpus.

## Eixos semânticos

- **X — Bacia ontológica e narrativa:** posição por cluster.
- **Y — Da constituição à manifestação narrativa:** usa `level` de 1 a 5.
  - 1: fonte, autoria e constituição do projeto;
  - 2: lei, doutrina, cosmologia e fonte de poder;
  - 3: entidade, sistema, instituição, espécie ou espaço;
  - 4: relação, conflito, mecanismo, mandato ou pressão;
  - 5: arco, incidente, forma ou output narrativo.
- **Z — Centralidade relacional:** grau calculado pela engine.

## Metadata e lineage

Cada nó preserva:

- `kind`
- `summary`
- `sourceFile`
- `sourceSection`
- `canonicity`
- `epistemic`

Cada link preserva `evidence` e pode incluir resumo ou referência lógica. Nenhuma URL privada foi publicada.

## Canonicidade

- `reference`: parâmetro estável ou referência prioritária sem pretensão de linha única;
- `canon-provisional`: decisão recente ativa, ainda refinável por Moon;
- `fragment-multiversal`: válido como fragmento/realidade possível, não lei universal;
- `sandbox`: exploração experimental;
- `legacy`: memória histórica sem autoridade presente automática;
- `meta`: governança do projeto, não fato intradiegético.

## Sanitização e omissões conhecidas

Não entram no dataset público:

- URLs privadas e conteúdo integral dos Google Docs;
- dados íntimos ou autobiográficos que não sejam necessários à arquitetura de ACL;
- manuscritos completos;
- níveis detalhados de Glýxia ainda dependentes de arquivos físicos/datilografados;
- sequência oficial de apresentação da Cascata Vital, deliberadamente deixada em aberto;
- objetos e personagens de rascunhos contraditórios sem função estrutural suficiente;
- inferências que transformariam proximidade em causalidade;
- leitura única e linear do multiverso.

## Fixture

- **caminho:** `docs/datasets/acl/fixture.v1.1.json`
- **escala:** 28 nós, 29 links e 5 clusters
- **função:** ratificar fonte/constituição, cosmologia, Lúmens, Feras, conflito central, canonicidade e eixos antes do corpus completo.

## Publicação canônica

- **caminho:** `public/datasets/acl/dataset.json`
- **escala:** 70 nós, 98 links, 10 clusters e 23 famílias de relação
- **registry id:** `acl`
- **registry path:** `acl/dataset.json`
- **URL prevista:** `https://luahelenammc.github.io/3D-Cluster-Engine/?dataset=acl`
- **tags:** `acl`, `lithia`, `worldbuilding`, `fantasy`, `multiverse`, `lumens`, `beasts`, `shadows`, `narrative`, `msl-4.1`

## Critérios de aceitação

- schema 1.1 válido;
- IDs de clusters, nós e links únicos;
- clusters e endpoints existentes;
- nenhum nó isolado;
- grafo conectado;
- eixos declarados e `level` coberto de 1 a 5;
- fonte, seção, canonicidade e estatuto epistemológico preservados;
- fixture validada antes do corpo completo;
- dataset em pasta própria;
- entrada única no registry;
- lint, testes unitários e build aprovados na CI;
- deploy confirmado na superfície pública;
- URL direta abre o dataset `acl`.
