# Dataset Publishing Protocol 1.0

## Função
Transformar qualquer projeto legível em um dataset canônico, validado, rastreável e selecionável na superfície pública do LMS 3D Cluster Engine, sem alterar o renderer nem criar um fork por corpus.

## Resultado obrigatório
Uma ingestão concluída produz:
- um mapa de tradução explícito entre o projeto-fonte e o grafo;
- um `dataset.json` canônico no contrato `schemaVersion: 1.1`;
- uma entrada em `public/datasets/registry.json`;
- validação estrutural, semântica e de escala aprovada;
- inspeção visual em desktop e mobile;
- URL compartilhável no formato `?dataset=<dataset_id>`;
- rastreabilidade suficiente para voltar de cada nó importante à fonte original.

## Pipeline vinculante
```text
projeto-fonte
→ inventário de fontes
→ decisão ontológica explícita
→ mapa de tradução
→ fixture pequena
→ dataset canônico 1.1
→ validação
→ inspeção visual
→ dataset completo
→ registro público
→ commit e CI
→ deploy
→ confirmação na superfície publicada
```

## Ficha de ingestão
Antes de gerar o corpo completo, declarar:

```text
project_id:
display_title:
project_description:
source_files:
source_version_or_date:
node_definition:
link_definition:
cluster_definition:
link_direction:
link_weight_meaning:
node_size_meaning:
x_axis_meaning:
y_axis_meaning:
z_axis_meaning:
metadata_to_preserve:
source_traceability:
dataset_path:
registry_tags:
known_omissions:
```

Campos desconhecidos não devem ser preenchidos por invenção. Ausência relevante vira `known_omissions` ou metadata de incerteza.

## Decisão ontológica
### Nós
Um nó deve representar uma entidade que permanece identificável e útil quando isolada: pessoa, módulo, documento, instituição, conceito, tarefa, evento, recurso ou outro objeto do domínio.

Não converter automaticamente todo heading, frase ou menção em nó. Granularidade precisa servir à investigação.

### Links
Um link só existe quando há uma relação declarada, derivada por regra documentada ou inferida com marcação explícita de incerteza.

Para cada tipo de link, registrar:
- significado;
- direção;
- origem da evidência;
- peso, quando houver;
- se relações paralelas são legítimas.

Proximidade textual ou espacial não constitui relação por si só.

### Clusters
Cluster representa uma família estável e explicável: setor, domínio, módulo, origem, território, fase, classe ou outra divisão real do projeto.

Não usar cluster apenas para obter uma paleta bonita. Se a classificação for ambígua, preservar a nuance em metadata e escolher uma regra operacional documentada.

### Eixos
X, Y e Z são uma gramática universal; o significado pertence ao corpus.

Cada eixo precisa declarar:
- label humano;
- fonte de dados;
- direção semântica;
- fallback para valores ausentes;
- motivo pelo qual a dimensão melhora a leitura.

Um eixo pode ser desligado quando não existe gradiente defensável.

## Construção do dataset
### Caminho canônico
Cada projeto publicado ocupa:

```text
public/datasets/<project_id>/dataset.json
```

Opcionalmente, a pasta pode incluir um `README.md` com lineage, decisões e limitações. O arquivo consumido pelo index continua sendo `dataset.json`.

### Regras de identidade
- `project_id`, IDs de clusters, nós e links usam valores estáveis e legíveis por máquina;
- renomear label não deve trocar ID sem motivo de identidade;
- todo link possui ID canônico único;
- todo nó referencia um cluster declarado;
- todo endpoint de link existe;
- metadata específica do projeto permanece em `metadata` ou `extensions` namespaced.

### Lineage mínimo
Quando possível, cada nó inclui em metadata um ou mais destes campos:

```json
{
  "sourceFile": "arquivo-fonte.md",
  "sourceSection": "Heading ou caminho lógico",
  "sourceId": "identificador no sistema de origem",
  "sourceUrl": "URL autorizada",
  "evidence": "declared | derived | inferred",
  "confidence": 1
}
```

Não publicar URLs privadas, dados pessoais ou material restrito apenas para completar lineage.

## Fixture antes do corpo completo
A primeira passagem deve conter aproximadamente:
- 2–5 clusters;
- 10–30 nós;
- relações suficientes para testar direção, peso e vizinhança;
- exemplos de metadata e valores de eixo;
- casos centrais, periféricos e pontes.

A fixture serve para ratificar a tradução. Escalar um mapeamento ruim apenas produz um erro mais vistoso.

## Registry
A biblioteca pública vive em `public/datasets/registry.json` e segue `schema/dataset-registry.schema.json`.

Entrada mínima:

```json
{
  "id": "project-x",
  "title": "Project X",
  "description": "Descrição curta e pública.",
  "path": "project-x/dataset.json",
  "tags": ["domain", "project-x"]
}
```

Leis:
- IDs de entrada são únicos;
- `path` é relativo a `public/datasets/`;
- caminhos absolutos, protocolos e `..` são proibidos;
- a entrada só é adicionada depois que o dataset existe e passa na validação;
- `defaultDataset` precisa apontar para uma entrada real;
- registrar um arquivo torna o projeto selecionável no index; apenas armazená-lo no repositório não basta.

## URL compartilhável
Um dataset registrado pode ser aberto diretamente por:

```text
https://luahelenammc.github.io/3D-Cluster-Engine/?dataset=<dataset_id>
```

ID ausente ou desconhecido recua para o dataset padrão. Importações manuais continuam locais e não entram automaticamente no registry.

## QA por dataset
### Conteúdo
- O mapa de tradução responde claramente o que é nó, link e cluster?
- Relações inferidas estão identificadas?
- O grafo omite algo que mudaria materialmente sua interpretação?
- Labels são humanos; IDs são estáveis?
- Lineage e atribuição foram preservados sem violar privacidade?

### Contrato
- `schemaVersion` é `1.1`?
- O JSON passa pelo schema e pela validação semântica?
- Não existem IDs duplicados, clusters inexistentes ou links órfãos?
- Importar e exportar preserva campos estruturais, metadata e extensions?

### Espaço
- X, Y e Z significam algo defensável?
- Pontes, periferias e concentrações são legíveis?
- Filtros não redefinem silenciosamente a geografia?
- Tamanho, cor, direção e distância não fazem claims não declarados?

### Superfície
- O dataset abre pelo seletor e pelo query parameter?
- Busca, filtros, inspector e Neighborhood Illumination funcionam?
- O primeiro enquadramento é utilizável?
- Desktop e mobile permanecem controláveis?
- Densidade e labels respeitam o envelope de performance?

### Publicação
- lint, testes e build passam?
- CI conclui antes do merge?
- deploy da `main` foi confirmado?
- a URL pública foi aberta de fato, sem inferir sucesso apenas pelo commit?

## Regras para agentes
Quando receber a ordem “mapeie este projeto para o 3D Cluster Engine”:
1. consultar este protocolo, o contrato de dados e o projeto-fonte;
2. produzir a ficha de ingestão e declarar decisões ambíguas;
3. construir e validar uma fixture pequena;
4. somente depois gerar o dataset completo;
5. criar a pasta do projeto e registrar a entrada;
6. executar lint, testes e build por CI;
7. não alterar o renderer para acomodar uma ontologia local;
8. não substituir o demo nem outro dataset;
9. não alegar deploy ou visibilidade sem confirmação;
10. retornar o ID registrado, caminho, commit e URL compartilhável.

## Critério de conclusão
O trabalho não termina quando existe um JSON. Termina quando o corpus atravessa a porta completa:

> fonte rastreável → tradução ratificada → contrato válido → registry → CI → deploy → inspeção pública.
