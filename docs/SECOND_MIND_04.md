# Second Mind 0.4 — Knowledge Compiler, revisão e continuidade

**Author:** Lua Helena Moon Martins Cardoso  
**Status:** Branch de implementação `feature/second-mind-knowledge-compiler-04`; integração na `main` e deploy dependem de QA do commit final.  
**Scope:** expansão local-first do Knowledge Engine 0.3 sem alterar `GraphDataset 1.1`, `GraphStore`, sem migrar o corpus privado para o GitHub.

## Arquitetura entregue na branch

```text
SourceManifest (fontes humanas e hashes soberanos)
      + GraphDataset 1.1 (arestas aceitas)
      + KnowledgeLedger (evidências validadas)
                 |
     planWikiCompilation()          // read only
                 v
     WikiPlan (add/revise/stale, diff, warnings)
                 |
      aceite explícito por página
                 v
     commitWikiPlan() -> saveManagedWiki()
                  |       IDB revisão atômica + readback
                  v
          ManagedWiki 1.0 (sidecar)
         /            |              \
     BM25         Obsidian          MCP
     resume      export/roundtrip    snapshot
        \            |               /
          2D/3D e inspector 0.3
```

O compilador atual gera **páginas derivadas determinísticas**, baseadas em relações canônicas aceitas e evidências cujo caminho, fingerprint e citação correspondem às fontes atuais. **Não é uma inteligência autônoma que sintetiza todo o corpus**. A IA externa existente permanece sob consentimento explícito e `GraphDeltaProposal`, não ganhou autorização para alterar o vault. A engine não executa tarefas em background.

### Módulos

- `wiki.ts`: `WikiPlan`, deltas por página, IDs estáveis, status `sourced|structural|stale`, backlinks, notas humanas separadas, revisão, log, restauração e idempotência. Nenhuma alteração automática das fontes ou do dataset.
- `persistence.ts`: salvamento local da `ManagedWiki` com revisão esperada e readback, em um único registro IndexedDB (localStorage fallback; não criptografado). O fallback é best effort, não bloqueio transacional entre abas.
- `chronology.ts`: anotações efetivas **humanas** com `observedAt`, `validFrom`, `validUntil`, interpretação `confirmed|contested|superseded|uncertain`. Validar datas e relação aceita; registrar distinção sem mutar estado canônico.
- `hybrid.ts`: BM25 + texto aproximado e relações locais, vetores opcionais via `Ollama /api/embed` somente em loopback, ação explicitamente autorizada. Não há vetorização, download de modelos nem envio externo automático.
- `resume.ts`: pacote de retomada limitado por orçamento de caracteres/tokens aproximados; lint de fontes, citações e backlinks.
- `wiki-interop.ts`: vault Markdown + JSON Canvas + mapa de identidade; conversão de links internos para filenames reais; validação read-only de Canvas; round-trip restrito à seção **Nota humana**, com integridade do corpo compilado, revisão e aceite explícito.
- `portable.ts`: snapshot reduzido e deliberadamente exportado para ferramentas locais; não contém arquivos Markdown originais nem dados históricos completos.
- `companion/knowledge-mcp.mjs`: servidor stdio MCP somente leitura; recebe exclusivamente o caminho de snapshot exportado via variável de ambiente, não explora o vault. Ferramentas `overview`, `search`, `read_page`, `backlinks`, `find_path` (caminho estrutural; não comprovação causal).

### Interface

Na aba **Second Mind → Knowledge Engine**, o Knowledge Compiler 0.4 oferece modos **Explorar**, **Perguntar** e **Revisar**. A seção anterior de ferramentas 0.3 continua acessível em detalhes, preservando overlays, consultas, exportadores e o renderer 2D/3D. Em Revisar, o usuário escolhe páginas para atualizar e observa diferenças antes/depois, sem writeback automático. Em Explorar, consulta páginas e fonte, escreve notas humanas, exporta Obsidian e inspeciona Canvas; a importação de nota pode modificar apenas a anotação humana, nunca o corpo compilado. Em Perguntar, pesquisa localmente e exporta contexto.

## Como usar sem expor o corpus

1. Abrir **Fontes** e selecionar notas Markdown locais; nenhuma transmissão ocorre na importação.
2. Abrir **Knowledge Engine → Revisar** e inspecionar o plano; páginas derivadas podem ficar apenas **estruturais** se nenhuma relação canônica tem evidência validada. Isto é comportamento correto, não falha da análise.
3. Aceitar somente as páginas desejadas. A transação local devolve revisão e confirma readback; mesmo ao reabrir o navegador, a wiki persiste no perfil.
4. Em **Explorar**, usar as notas e exportar um vault Obsidian por ação humana. Arquivos exportados podem conter dados confidenciais; revisar antes de publicar.
5. Em **Perguntar**, usar BM25 local. Embeddings exigem Ollama rodando na máquina do usuário, modelo instalado e consentimento específico. O front-end hospedado pode ter restrições de CORS/mixed-content com serviço local; não há gateway público.
6. Para clientes MCP locais, exportar **Snapshot MCP somente leitura** e configurar o cliente, por exemplo:

```bash
LMS3D_MCP_SNAPSHOT=/caminho/privado/lms3d-mcp-readonly.json node companion/knowledge-mcp.mjs
```

O processo atende JSON-RPC por stdio. Não abre porta HTTP, não indexa diretórios e não faz writeback.

## QA e limites de aceitação

CI com `npm run lint`, `npm test` (Vitest, companion Node, tsc e Vite) e teste Playwright de navegador no desktop e mobile. Fixtures são **sintéticas**. As asserções verificam false positives de busca, referência/versão, preservação de notas humanas, stale source, revisão atômica, restauração, datas efetivas, Canvas, links de wikilink e MCP read-only. Um teste funcional com Ollama real/modelo instalado e um gold set de precisão semântica **ainda não existe**; não alegar que foi validado.

Limites intencionais:
- Fonte soberana continua fora do compilador: esta wiki **não substitui** Google Drive, GitHub, Obsidian, as fontes humanas nem `GraphDataset 1.1`.
- A versão 0.4 não faz edição arbitrária de Markdown de fontes, nem importação reversa de Canvas para o grafo, nem sincronização bidirecional genérica do vault. O round-trip protegido é apenas de notas humanas.
- Modelos LLM não sintetizam conteúdo livre automaticamente nesta versão. O motor determinístico não deve ser confundido com compreensão factual da fonte integral.
- Tempo de vigência é informado e revisado por humanos, não inferido da prosa e não altera unilateralmente `epistemicStatus`.
- Acesso local do MCP é apenas ao snapshot selecionado, mas o snapshot **pode ser privado**, logo a exportação e a configuração devem ser deliberadas.
- Armazenamento IndexedDB é local e não criptografado; APIs de armazenamento e FS dependem do browser. Nenhuma promessa de compliance clínico/enterprise.
- Sem plugin/dependência oficial Graphify transplantada. Pesquisa original inspirada nos padrões de Obsidian+Claude, LLM Wiki e MCP, com autoria própria e revisão de licença necessária antes de distribuição comercial.
