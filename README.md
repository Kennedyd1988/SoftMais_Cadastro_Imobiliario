# SOFT+ Cadastro Imobiliário

Aplicativo para atualização em campo do Boletim de Cadastro Imobiliário
(BCI) de prefeituras, com preenchimento automático de bairro, setor,
distrito e dados do proprietário a partir dos cadastros de apoio.
Multi-tenant (várias prefeituras/entes, cada uma com dados isolados),
seguindo o mesmo padrão arquitetural dos demais apps SOFT+: front-end
estático (HTML/CSS/JS puro), Firebase (Auth + Firestore + Storage) como
backend, GitHub Pages como hospedagem, PWA instalável.

## O que ainda falta fazer antes do app funcionar

1. **Criar um projeto Firebase** (ou reaproveitar um já existente) com
   **Authentication** (e-mail/senha), **Firestore Database** e
   **Storage** habilitados.
2. **Preencher `js/firebase-config.js`** com os dados reais do projeto
   (Firebase Console → Configurações do projeto → Seus apps → app Web).
3. **Publicar as regras de segurança**:
   - `firestore.rules` → Firebase Console → Firestore Database → Regras.
   - `storage.rules` → Firebase Console → Storage → Regras.
4. **Criar os ícones do PWA** com a logo do cliente, se quiser
   personalizar além da marca SOFT+ (os arquivos `icon-192.png`,
   `icon-512.png`, `icon-512-maskable.png` já vêm prontos com a marca
   SOFT+ padrão).
5. **Criar a primeira prefeitura/ente e o primeiro usuário
   administrador** diretamente pelo Firebase Console, já que o próprio
   app exige login de administrador pra cadastrar os demais:
   - Coleção `entidades` → documento novo → `{ nome: "Prefeitura de..." }`.
   - Authentication → criar usuário (e-mail/senha).
   - Coleção `usuarios/{uid}` (uid = o mesmo ID gerado no Authentication):
     `{ nome, email, papel: "administrador", unidadesGestoras: [], abasPermitidas: [] }`.
   - Depois desse primeiro registro manual, tudo o mais pode ser feito
     pelas telas de "Usuários" e "Prefeituras / Entes" dentro do app.
6. **Subir os arquivos no GitHub Pages**, do mesmo jeito que os outros
   apps SOFT+ (edição direta pelo editor web do GitHub).
7. **Cadastrar Zonas e Distritos primeiro** (são a base de Bairros e
   Setores) — ou, melhor ainda, rodar a **Importação do Legado** (menu
   Administração → Importação do Legado) com a planilha XLSX do
   sistema antigo, que já popula tudo isso automaticamente.
8. **Índices do Firestore**: algumas buscas (por texto normalizado, por
   CPF/CNPJ, filtro de status por bairro) podem pedir a criação de um
   índice composto na primeira vez que rodarem — se aparecer um erro no
   console do navegador (F12) com um link "create it here", é só
   clicar; o Firestore cria automaticamente.
9. **CORS do Firebase Storage** (necessário só para o croqui aparecer
   no PDF exportado — fotos e o resto do app funcionam sem isso):
   por padrão, o bucket do Storage não libera acesso "cross-origin" a
   partir do domínio do GitHub Pages, e o navegador bloqueia o
   `fetch()` que a exportação em PDF usa pra buscar a imagem do croqui.

   **Passo a passo pelo navegador, sem instalar nada no computador**
   (usa o Cloud Shell, um terminal que já vem pronto dentro do Google
   Cloud Console):

   1. Acesse **https://console.cloud.google.com/**, logado com a
      mesma conta Google usada no Firebase.
   2. No topo da página, clique no seletor de projeto e escolha
      **softmais-cadastro-imobiliario** (é o mesmo projeto do Firebase
      — Firebase e Google Cloud compartilham o mesmo projeto por trás).
   3. Clique no ícone de terminal **">_"** no canto superior direito
      da tela (chama "Ativar o Cloud Shell"). Uma janela de terminal
      abre na parte de baixo da tela — pode levar uns 30 segundos pra
      carregar na primeira vez.
   4. Nesse terminal, crie o arquivo de configuração colando o comando
      abaixo (ele já cria o arquivo `cors.json` com o conteúdo certo —
      não precisa copiar o arquivo do computador pra lá):
      ```
      cat > cors.json << 'EOF'
      [
        {
          "origin": [
            "https://kennedyd1988.github.io",
            "http://localhost:*"
          ],
          "method": ["GET", "HEAD"],
          "maxAgeSeconds": 3600,
          "responseHeader": ["Content-Type"]
        }
      ]
      EOF
      ```
      Pressione Enter depois de colar — o bloco inteiro (incluindo o
      `EOF` do final) precisa ser colado de uma vez só.
   5. Aplique a configuração no bucket com este comando (o Cloud Shell
      já vem com o `gsutil` instalado e autenticado, não precisa fazer
      login de novo):
      ```
      gsutil cors set cors.json gs://softmais-cadastro-imobiliario.firebasestorage.app
      ```
   6. Se aparecer `Setting CORS on gs://...` sem nenhuma mensagem de
      erro depois, deu certo. Pra conferir, rode:
      ```
      gsutil cors get gs://softmais-cadastro-imobiliario.firebasestorage.app
      ```
      e confira se o domínio `kennedyd1988.github.io` aparece na
      resposta.
   7. Volte no app, abra um boletim que já tenha um croqui salvo e
      exporte o PDF de novo — o croqui deve aparecer agora.

   Sem esse passo, o croqui continua sendo desenhado e salvo
   normalmente — só não aparece dentro do PDF exportado (o app avisa
   isso com um toast de erro específico quando acontece). O arquivo
   `cors.json` também está incluído nesta entrega, caso prefira usar o
   `gsutil` já instalado no seu computador em vez do Cloud Shell.

## Estrutura de dados

```
entidades/{entidadeId}                     — prefeitura/ente (multi-tenant)
  ├─ zonas/{id}                            — nome
  ├─ distritos/{id}                        — nome
  ├─ tiposImovel/{id}                      — nome
  ├─ condominios/{id}                      — nome
  ├─ bairros/{id}                          — nome, zonaId, zonaNome
  ├─ setores/{id}                          — nome, distritoId, distritoNome
  ├─ quadras/{id}                          — nome, setorId, setorNome, distritoId, distritoNome
  ├─ logradouros/{id}                      — nome, tipo, bairroId, bairroNome, cep, codigoLegado
  ├─ contribuintes/{id}                    — nome, cpfCnpj, telefone, celular, email, endereço
  ├─ boletins/{id}                         — o BCI completo (ver campos abaixo)
  │    └─ coProprietarios/{id}             — nome, cpfCnpj, percentual (item 11 do BCI)
  └─ historico/{id}                        — auditoria (quem alterou o quê e quando)
```

O vínculo em cascata que permite o auto-preenchimento no boletim:
**Logradouro → Bairro + CEP** (ao escolher o logradouro) e
**Quadra → Setor → Distrito** (ao escolher a quadra). Isso reflete
exatamente como a base legada da Prefeitura de Serrinha dos Pintos
está estruturada (tabelas `LOGRADOURO`, `BAIRRO_LOGRADOURO`, `QUADRA`,
`SETOR_QUADRA`, `SETOR_MUNICIPIO`).

## Funcionalidades além do que foi pedido

Estas foram sugeridas e já implementadas, pensando na campanha de
atualização em campo:

- **Captura de GPS** (latitude/longitude) direto na vistoria, com um
  botão "usar minha localização atual" no boletim.
- **Fotos do imóvel** anexadas via Firebase Storage, redimensionadas no
  navegador antes do envio pra não gastar armazenamento com fotos de
  10 MB direto da câmera do celular.
- **Painel de progresso da campanha** (Início e Relatórios): quantos
  imóveis já foram atualizados nesta campanha vs. quantos ainda faltam,
  com detalhamento por bairro e exportação em CSV.
- **Exportação do boletim em PDF**, organizado por seção, pra impressão
  ou arquivamento.
- **Checagem de inscrição imobiliária duplicada** antes de salvar.
- **Cálculo aproximado de área (retangular)** como atalho opcional nas
  medidas do terreno/construção — sempre editável, nunca obrigatório.
- **Busca de contribuinte por CPF/CNPJ ou nome**, com preenchimento
  automático de nome/telefone/e-mail no boletim.

### Sugestões para uma próxima etapa (não implementadas ainda)

- **Modo "revisão por quadra"**: uma tela que lista os imóveis de uma
  quadra específica, pra equipe de campo ir varrendo geograficamente
  sem precisar buscar um por um.
- **Assinatura digital do responsável** (campo de assinatura em canvas)
  no ato da vistoria, dando validade adicional ao boletim digital.
- **Modo rascunho offline**: hoje o app depende de conexão com a
  internet a cada salvamento; pra áreas rurais sem sinal, valeria uma
  fila local de boletins pendentes de sincronização.
- **Alerta de inconsistência**: ex. área construída maior que área do
  terreno, ou dimensões da unidade muito diferentes da área total.

## Decisões técnicas e por quê

- **Fotos no Firebase Storage, não em base64 no Firestore**: decisão
  explícita do cliente, sabendo que isso tem custo, porque o volume de
  fotos de vistoria de campo (várias por imóvel, centenas de imóveis)
  ultrapassaria rapidamente o que é razoável guardar em base64 dentro
  de um documento do Firestore (limite de 1 MB por documento).
- **Sem coleção de Condomínio na importação do legado**: a planilha
  original não trouxe uma aba de condomínios (só o `sq_condominio`
  dentro de `IMOVEL`, sem catálogo). O campo fica disponível pra
  cadastro manual dentro do app.
- **IDs determinísticos na importação (`legado_<tipo>_<sq_...>`)**:
  permite rodar a importação mais de uma vez com a mesma planilha (ou
  uma atualizada) sem duplicar nada — cada `set(..., {merge:true})`
  atualiza o registro já existente.
- **Boletim como página cheia, não modal**: o formulário tem mais de
  60 campos (fiel ao BCI oficial), grande demais pra caber
  razoavelmente numa janela modal — usa seções recolhíveis
  (`<details>`) pra não sobrecarregar a tela.
- **Detalhamento de progresso por bairro usando `count()` por bairro**,
  não um `GROUP BY`: o Firestore não tem agregação por grupo nativa;
  como a lista de bairros é pequena (dezenas, não milhares), rodar uma
  consulta de contagem por bairro é aceitável e ainda assim nunca baixa
  os boletins inteiros pra somar no cliente.
- **Paginação em lotes de 50** na lista de Boletins, Logradouros e
  Contribuintes (que crescem sem limite). Setores, Quadras, Bairros,
  Distritos, Zonas e Tipos de Imóvel carregam a lista inteira de uma
  vez nos formulários de seleção — são cadastros geograficamente
  limitados (algumas dezenas), não uma lista que cresce sem limite.
- **Campo `origemLegadoId`** gravado em cada boletim importado, pra
  rastreabilidade de qual registro do sistema antigo deu origem a cada
  boletim.

## Limitações conhecidas

- A importação do legado assume que a planilha segue exatamente os
  nomes de aba e de coluna do sistema de origem (ZONA, DISTRITO,
  TIPO_IMOVEL, BAIRRO, SETOR_MUNICIPIO, SETOR_QUADRA, QUADRA,
  BAIRRO_LOGRADOURO, LOGRADOURO, CONTRIBUINTE, IMOVEL, AREA_IMOVEL). Se
  o nome de uma aba mudar, ela é simplesmente ignorada (sem erro) —
  confira o log ao final da importação pra ver quantos registros de
  cada tipo foram processados.
- Os campos de característica física do BCI (natureza, edificação,
  estrutura, cobertura, etc.) não existem na base legada — ficam em
  branco após a importação, porque são justamente o que a campanha de
  atualização em campo precisa preencher.
- A regra "nunca deixar o sistema sem nenhum administrador" está
  implementada apenas na interface (`js/usuarios.js`), não nas regras
  do Firestore, pelo mesmo motivo já documentado nos outros apps SOFT+
  (checar isso dentro da regra exigiria uma consulta adicional a cada
  escrita).
- Upload de fotos: sem limite técnico rígido no app além dos 8 MB por
  arquivo definidos em `storage.rules`, mas o redimensionamento no
  navegador (`redimensionarImagemParaBlob`) já reduz isso na prática.

## Changelog

- **v1.0** — Primeira entrega: login multi-tenant, cadastros de apoio
  (Tipos de Imóvel, Distritos, Zonas, Setores, Quadras, Bairros,
  Logradouros, Condomínios, Contribuintes), Boletim (BCI) completo com
  auto-preenchimento de vínculos, fotos via Storage, captura de GPS,
  exportação em PDF, painel de progresso e importação da base legada.

- **v1.1**:
  - **Padrão de inscrição imobiliária**: Distrito(2) . Setor(2) .
    Quadra(3) . Lote(4) . Unidade(3). Distritos, Setores e Quadras
    ganharam campo de código próprio; o boletim tem um botão "🔄 Gerar"
    que monta a inscrição automaticamente a partir da Quadra, Lote e
    Unidade escolhidos (o campo continua editável manualmente, pra não
    travar em casos que fujam do padrão). A importação do legado já
    deriva esses códigos automaticamente (de `nu_setor`/`nu_quadra`
    quando existem na planilha, ou do número embutido no nome, ex:
    "SETOR 04" → código "04").
  - **Combo com busca** em todo campo de vínculo que representa um
    cadastro que pode crescer (Logradouro, Quadra, Condomínio, Tipo de
    Imóvel no boletim; Distrito, Setor, Zona, Bairro nos cadastros de
    localização) — substitui o `<select>` simples por um campo de texto
    que filtra a lista conforme digita, funciona melhor em
    celular/tablet. Os campos de código fixo do próprio BCI (natureza,
    edificação, estrutura etc.) continuam como `<select>` comum, por
    serem listas curtas e fixas (no máximo ~9 opções).
  - **Endereço de correspondência com "mesmo do proprietário"**: opção
    que copia automaticamente o endereço já cadastrado do proprietário
    (tela Contribuintes) para a seção 06 do boletim.
  - **Croquis da Unidade**: quadro de desenho livre (dedo ou mouse),
    com fundo quadriculado como no boletim em papel, salvo como PNG no
    Firebase Storage e incluído automaticamente na exportação em PDF.
  - **PDF revisado** para cobrir todas as seções do BCI oficial que
    faltavam: Endereço de Correspondência, Informações Gerais sobre o
    Terreno, Ano de Aquisição e Dimensões da Unidade, Demais
    Proprietários e o Croquis (como imagem).
  - **Exclusão de boletim mais completa**: agora também apaga a
    subcoleção de co-proprietários e os arquivos (fotos + croqui) no
    Storage, evitando lixo de dados/armazenamento órfão.

- **v1.2**:
  - **Correção de sobreposição no PDF**: rótulos longos (ex: "Terreno —
    Frente/Fundo/Ld.Dir/Ld.Esq") estavam sobrepondo o valor ao lado,
    porque a posição do valor era um deslocamento fixo. Agora a posição
    é calculada pela largura real do texto do rótulo — e, quando o
    rótulo é comprido demais pra caber numa linha só, o valor desce pra
    uma linha própria em vez de espremer. A seção de Medidas do Imóvel
    também foi reorganizada (Frente/Fundo numa linha, Lado
    Direito/Esquerdo em outra) para ficar mais legível.

- **v1.3** — Correção do Croqui da Unidade, que não estava salvando
  nem exportando:
  - **Causa raiz nº 1**: a seção "Croquis da Unidade" começa recolhida
    (como todas as seções secundárias do boletim); o canvas de desenho
    era criado e dimensionado assim que a página carregava, num
    momento em que ainda estava escondido — resultando num canvas de
    tamanho 0x0, onde nada podia ser desenhado de verdade. Agora o
    canvas só é criado no momento em que o usuário clica em
    "Desenhar/Refazer croqui", quando a seção já está visível e com
    tamanho real.
  - **Causa raiz nº 2**: ao reabrir um boletim, o app tentava recarregar
    o croqui salvo desenhando a imagem de volta dentro do canvas (via
    `<img crossOrigin="anonymous">`), o que só funciona se o bucket do
    Firebase Storage tiver CORS liberado pro domínio do app — e o
    mesmo vale pra exportação em PDF, que busca a imagem via `fetch()`.
    Sem CORS configurado, isso falhava silenciosamente. Agora o croqui
    salvo é mostrado como uma pré-visualização simples (`<img>` comum,
    sem exigir CORS) acima do botão de refazer o desenho — só a
    exportação em PDF continua precisando do CORS liberado (ver item 9
    da lista de configuração inicial, acima, e o arquivo `cors.json`
    incluído nesta entrega); se não estiver configurado, o app agora
    avisa isso explicitamente ao tentar exportar, em vez de falhar
    calado.

- **v1.4** — Três correções:
  - **Cálculo de área "aproximado" estava errado**: o botão "≈
    Calcular" fazia `(frente + fundo) / 2` — isto é, a *média* das duas
    frentes, não uma área. Um lote de 5×5 dava "5" em vez de "25". A
    fórmula correta agora usa os 4 lados (aproximação trapezoidal, o
    padrão pra lotes urbanos que raramente são retângulos perfeitos):
    `((frente + fundo) / 2) × ((lado direito + lado esquerdo) / 2)` —
    num lote perfeitamente retangular isso dá exatamente base × altura.
  - **Lista do combo com busca cortada** (ex: Tipo de Imóvel, Logradouro,
    Quadra): a seção do formulário tinha `overflow: hidden` (usado só
    pra arredondar os cantos visuais), que também cortava a lista
    suspensa de resultados quando ela "vazava" pra fora da seção. O
    arredondamento dos cantos agora é feito no cabeçalho da seção
    (`<summary>`) em vez de depender desse corte.
  - **Passo a passo do CORS** documentado abaixo de um jeito que não
    exige instalar nada no computador (usa o Cloud Shell do navegador).

- **v1.5** — Três correções no Croqui e nas Fotos:
  - **Croqui "sumindo" depois de salvar o boletim**: ao salvar, a tela
    era recarregada com um objeto local montado a partir só dos campos
    do formulário — que não incluíam `croquiUrl`/`croquiCaminho`/`fotos`
    (esses são gravados à parte, direto no Storage + Firestore). O
    croqui continuava salvo no banco, só sumia da tela. Agora, depois
    de salvar, o app busca o documento completo e atualizado do
    Firestore antes de reabrir o editor.
  - **Fotos não apareciam no PDF exportado**: a exportação em PDF nunca
    tinha uma seção de Fotos — foi adicionada (miniaturas em grade,
    2 por linha, mantendo a proporção original de cada foto sem
    esticar). Também precisa do CORS do Storage liberado (mesma
    configuração já usada pelo croqui); se alguma foto falhar ao
    carregar, o PDF avisa quantas não entraram, em vez de falhar calado.
  - **Botão "Desfazer" no croqui**: antes só existia "Limpar" (apaga
    tudo). Agora tem um botão "↩️ Desfazer" que volta só o último
    traço (ou o último "Limpar"), guardando um histórico da sessão de
    desenho na memória do navegador.
