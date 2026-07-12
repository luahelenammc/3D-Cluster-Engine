# Ficha de ingestão — Projeto Política

## Identidade pública

- **project_id:** `politica`
- **dataset_id:** `politica`
- **título público:** Projeto Política — mapa vivo
- **descrição pública:** mapa espacial sanitizado do projeto Política de Lua Helena Moon, reunindo governança, estratégia local, comunicação pública, ideologia, ensaio e história do Brasil.
- **protocolo:** Dataset Publishing Protocol 1.0
- **contrato canônico:** schema 1.1
- **versão do dataset:** 1.0.0
- **versão temporal do corpus:** consolidado até 2026-07-11
- **privacidade:** público sanitizado

## Inventário de fontes

1. `00. Política — Kernel, Modos e Governança`
2. `01. Política — Estratégia Local, Candidatura, Partido e Alcance`
3. `02. Política — Comunicação Pública, Instagram, Comentários e Arena`
4. `03. Política — Ideologia, Newsroom, Ensaio e Mapa 8D`
5. `04. Política – História do Brasil`

A fonte governa a semântica; o dataset é uma tradução espacial rastreável, não substituto do corpus.

## Decisão ontológica

### O que é nó

Um nó representa uma unidade com função própria e rastreável:

- arquivo-fonte;
- módulo ou programa;
- doutrina ou lente analítica;
- modo operacional;
- capability;
- família de outputs;
- ator público sanitizado;
- ponte externa relevante.

Patches pontuais não viram nós quando sua função já foi metabolizada por um módulo estável.

### O que é link

Um link representa relação declarada de:

- governança ou roteamento;
- composição;
- alimentação conceitual;
- tradução entre análise e ação;
- restrição/guardrail;
- produção;
- ponte estratégica;
- suporte histórico.

Proximidade espacial não cria relação. Relações inferidas devem ser explicitamente marcadas; esta versão usa apenas relações declaradas ou derivações estruturais conservadoras.

### O que é cluster

Clusters são as cinco bacias funcionais soberanas do projeto:

1. Governança e modos
2. Estratégia local e partido
3. Comunicação pública
4. Ideologia e ensaio
5. História do Brasil

## Direção e peso das relações

- **directed:** `true` por padrão; o sentido registra fluxo de autoridade, dependência, tradução ou produção.
- **weight 3:** relação load-bearing, sem a qual a arquitetura muda.
- **weight 2:** relação estrutural importante.
- **weight 1:** ponte, derivação ou influência secundária.

O peso não mede verdade, prestígio, votos ou força social externa.

## Tamanho dos nós

`value` representa importância load-bearing no projeto e na navegação do mapa.

Não representa:

- popularidade;
- intenção de voto;
- poder institucional real;
- volume de seguidores;
- centralidade calculada.

## Eixos semânticos

- **X — Bacia funcional:** posição por cluster.
- **Y — Da doutrina à ação pública:** usa `level` de 1 a 5.
  - 1: fonte e constituição
  - 2: doutrina, método e lente
  - 3: programa e tradução estratégica
  - 4: sistema operacional, canal ou articulação
  - 5: output e ação pública
- **Z — Centralidade relacional:** grau calculado pela engine.

## Metadata e lineage

Cada nó preserva:

- `kind`
- `summary`
- `sourceFile`
- `sourceSection`
- `status`
- `privacy`
- `epistemic`
- `lineage`

Cada link preserva `evidence` e, quando necessário, resumo da relação.

## Sanitização e omissões conhecidas

Não entram no dataset público:

- conversas privadas, telefones, e-mails e dados pessoais de interlocutores;
- informações clínicas, financeiras ou íntimas de Moon;
- nomes de pessoas privadas sem função pública necessária ao mapa;
- previsões eleitorais não ratificadas;
- cálculos de voto não confirmados;
- detalhes de negociação partidária cuja publicação possa causar dano;
- logs e patches já absorvidos por módulos estáveis.

`Political reaches` aparece apenas como ponte externa sanitizada: sua casa profissional vigente é Moon Professional Source, embora seus efeitos estratégicos possam ecoar no projeto Política.

## Fixture

- **caminho:** `docs/datasets/politica/fixture.v1.1.json`
- **escala:** 15 nós, 18 links, 5 clusters
- **função:** ratificar ontologia, territórios, direção das relações, eixo Y e legibilidade antes da publicação integral.

## Publicação canônica

- **caminho:** `public/datasets/politica/dataset.json`
- **registry id:** `politica`
- **registry path:** `politica/dataset.json`
- **URL prevista:** `https://luahelenammc.github.io/3D-Cluster-Engine/?dataset=politica`
- **tags:** `politica`, `limeira`, `psol`, `governance`, `communication`, `ideology`, `history`, `msl-4.1`

## Critérios de aceitação

- schema 1.1 válido;
- IDs únicos;
- clusters e endpoints existentes;
- nenhum nó isolado;
- eixos declarados e com cobertura integral;
- fixture inspecionável antes do corpus completo;
- dataset em pasta própria;
- entrada única no registry;
- lint, testes unitários e build aprovados na CI;
- deploy confirmado na superfície pública;
- URL direta abre o dataset registrado.
