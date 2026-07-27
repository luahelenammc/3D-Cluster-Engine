# Mapa de Projetos da Moon — preset do 3D Cluster Engine

## Ficha de ingestão

- **project_id:** `moon-projects-map`
- **display_title:** Mapa de Projetos da Moon
- **project_description:** visão canônica do portfólio atual de Lua Helena Moon, com 31 projetos únicos.
- **source_files:** `6. Bridges, Transplants e Interoperabilidade`, seção `7.0 Mapa canônico dos projetos atuais — 2026-07-27`.
- **source_version_or_date:** 2026-07-27, MSL 4.2.
- **node_definition:** um nó de projeto representa um projeto soberano e persistente; seis nós auxiliares representam as categorias.
- **link_definition:** pertencimento primário, pertencimento secundário em projetos multi-categoria e fronteiras de identidade explicitamente declaradas.
- **cluster_definition:** categoria principal do projeto: pessoal, profissional, IA, comunidade, criatividade ou apoio.
- **link_direction:** relações de pertencimento e distinção são não direcionais.
- **link_weight_meaning:** 3 = ponte multi-categoria; 2 = pertencimento primário; 1 = fronteira protetiva de identidade.
- **node_size_meaning:** prioridade operacional declarada; os hubs de categoria são maiores apenas para legibilidade.
- **x_axis_meaning:** categoria principal.
- **y_axis_meaning:** prioridade operacional (`C` → `A`).
- **z_axis_meaning:** ordem global declarada por Moon.
- **metadata_to_preserve:** ordinal, classe de prioridade, categorias, status da fonte e lineage.
- **source_traceability:** todos os projetos apontam para o mapa canônico do LMS; fontes adicionais localizadas são registradas apenas pelo nome.
- **dataset_path:** `public/datasets/moon-projects-map/dataset.json`
- **registry_tags:** `moon`, `projects`, `portfolio`, `msl-4.2`.
- **known_omissions:** o corpus soberano de `Horta` não foi localizado e permanece marcado como `[arquivos não encontrados]`.

## Leis ontológicas

1. O preset contém **31 projetos únicos**. Projetos multi-categoria não são duplicados.
2. `Moon Professional Source` pertence a Profissional e IA.
3. `Simbiosfera` e `SymbAI` pertencem a IA e Comunidade.
4. Ordinais repetidos `19` e `20` são preservados; as lacunas `24` e `25` não são preenchidas por invenção.
5. Classe de prioridade mede frequência operacional, não valor emocional, qualidade ou soberania.
6. As seguintes fronteiras devem permanecer visíveis:
   - Local Moon Source ≠ Moon Professional Source;
   - Lunar Citadel ≠ Citadela das Moons;
   - Hospital Medical (profissional) ≠ Hospital (pessoal);
   - Meu Macho ≠ Tinder.
7. Nenhum conteúdo íntimo ou interno dos projetos foi publicado: apenas nomes, classificação operacional e lineage mínimo.

## Convenção visual

- **rosa:** Pessoal;
- **laranja:** Profissional;
- **ciano:** IA e arquitetura;
- **violeta:** Comunidade;
- **azul:** Criatividade;
- **verde:** Apoio.

A escolha de cor serve à distinção visual; a semântica estrutural continua sendo dada pelos clusters, eixos e relações.
