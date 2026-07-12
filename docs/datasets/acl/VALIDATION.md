# Validação — dataset ACL

## Resultado local pré-PR

- **schemaVersion:** `1.1`
- **fixture:** 5 clusters · 28 nós · 29 links · 14 famílias de relação
- **dataset canônico:** 10 clusters · 70 nós · 98 links · 23 famílias de relação
- **IDs únicos:** aprovado
- **clusters e endpoints:** aprovado
- **nós isolados:** nenhum
- **conectividade:** componente único
- **grau médio / máximo:** 2.8 / 10
- **registry candidate:** `acl` → `acl/dataset.json`

## Higiene semântica

Os verbos exatos das fontes permanecem em `link.metadata.relation`; o campo `type` usa 23 famílias estáveis para filtros e leitura comparável. Assim o dataset preserva nuance sem converter cada verbo em uma categoria improvisada.

Cada nó preserva `kind`, `summary`, `sourceFile`, `sourceSection`, `canonicity` e `epistemic`. O mapa distingue referência, provisório, canon provisório, fragmento multiversal, sandbox, legado e meta.

## Gates dependentes do GitHub

1. validação formal pelo schema 1.1;
2. registry schema 1.0;
3. lint;
4. Vitest;
5. build Vite;
6. merge na `main`;
7. deploy do GitHub Pages;
8. abertura efetiva de `?dataset=acl`.
