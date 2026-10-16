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

10. **Se você atualizar os arquivos e a versão não mudar na tela**
   (rodapé do menu ou tela de login continuam mostrando a versão
   antiga), o motivo quase sempre é cache — nem sempre é o app:
   - **Confirme que o arquivo realmente foi salvo no GitHub**: abra
     `https://kennedyd1988.github.io/SEU-REPOSITORIO/js/core.js`
     direto no navegador e procure a linha `VERSAO_APP` — se ela já
     mostra o número novo ali, o problema é só cache local do
     navegador (veja abaixo); se ainda mostra o número antigo, o
     arquivo não chegou a ser publicado (confira se salvou no branch
     certo, ou aguarde alguns minutos — o GitHub Pages pode levar até
     alguns minutos pra publicar depois de um commit).
   - **Force uma atualização "limpa" no navegador**: `Ctrl+Shift+R`
     (Windows/Linux) ou `Cmd+Shift+R` (Mac) na página do app. Se ainda
     não mudar, abra o DevTools (F12) → aba **Application** →
     **Service Workers** → clique em **Unregister** → recarregue a
     página normalmente.
   - **Teste numa aba anônima/privada** — se lá a versão nova já
     aparece, confirma que era cache do navegador principal.
   - A partir da v1.7, o app já registra o service worker com
     `updateViaCache: "none"` e a página tem cabeçalhos de "não
     cachear" — isso reduz bastante esse tipo de atraso, mas alguns
     navegadores/proxies ainda podem levar um tempinho pra perceber a
     mudança.

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
  ├─ historico/{id}                        — auditoria (quem alterou o quê e quando)
  └─ controleExportacao/contadores         — contador interno da Exportação de Alterações
                                              (gera os sq_* novos para cadastros criados no app)
```

Cada cadastro de apoio (exceto Condomínio, que não existe no formato
legado) guarda o sq_* de origem da planilha legada — `sqLegado` em
Zona/Distrito/Tipo de Imóvel/Bairro/Setor/Quadra, `codigoLegado` em
Logradouro/Contribuinte, `origemLegadoId` em Boletim. Um registro
criado direto no app (sem vir da importação) não tem esse campo até a
primeira vez que entra numa Exportação de Alterações (menu
Administração → Exportação de Alterações — detalhes no changelog da
v1.9, abaixo). O modo "somente alterados" dessa exportação usa a
coleção `historico` (auditoria — ver changelog da v1.11) pra saber o
que foi incluído/editado manualmente, não um campo marcado no próprio
registro.

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

- **v1.6** — PDF reorganizado em tabelas de verdade, mais parecido com
  o boletim modelo em papel. Antes, cada campo era uma linha solta de
  texto "rótulo: valor"; agora cada seção vira uma tabela com grade e
  cabeçalho colorido (usando o plugin `jspdf-autotable`), incluindo uma
  tabela de Medidas do Imóvel bem próxima da tabela original do BCI
  (Frente/Fundo/Lado Direito/Lado Esquerdo/Quant. Total, uma linha pra
  Terreno e outra pra Construída) e a mesma divisão em duas tiras que o
  boletim em papel usa pra Fatores de Qualidade do Imóvel.

- **v1.7** — PDF redesenhado no estilo "caixas grudadas" do boletim em
  papel (a pedido, comparando com o modelo original enviado): trocou
  as tabelas com espaçamento entre si (da v1.6) por um layout contínuo
  de campos lado a lado com borda compartilhada — rótulo pequeno no
  canto da caixa, valor embaixo — igual ao BCI físico, mantendo as
  barras azuis só nos títulos de cada seção numerada (01/02, 03, 04,
  05, 06, 10, 11, 12) e das seções sem número (Caracterização,
  Informação sobre a Edificação, Informações Gerais sobre o Terreno,
  Fatores de Qualidade, Dimensões da Unidade). Também troquei "m²" por
  "m2" nos rótulos do PDF — a fonte padrão do jsPDF corta o símbolo de
  superscrito em alguns leitores de PDF — e ajustei células estreitas
  (ex: nome de distrito comprido) pra quebrar em duas linhas em vez de
  cortar o texto.

- **v1.8** — Três ajustes:
  - **Versão "presa" no navegador**: registrado o service worker com
    `updateViaCache: "none"` e adicionados cabeçalhos de "não cachear"
    na página — reduz o atraso pra uma atualização publicada aparecer
    de fato pro usuário (veja o item 10 da configuração inicial, acima,
    com o passo a passo caso ainda aconteça).
  - **PDF: duas cores diferentes** — a barra de título de cada seção
    numerada do BCI continua azul forte; o cabeçalho das "sub-tabelas"
    dentro de cada seção (ex: Frente/Fundo/Lado Direito, Natureza/
    Edificação, Nome/CPF/%) agora usa um cinza-azulado mais escuro com
    texto branco, pra ficar visualmente claro que são dois níveis
    diferentes de título.
  - **Números da seção "10 — Medidas do Imóvel" alinhados à direita**,
    como é padrão em campos numéricos de formulário.

- **v1.9** — Nova tela **"Exportação de Alterações"** (menu
  Administração), que gera uma planilha XLSX no mesmo layout/abas do
  arquivo original de importação (ZONA, DISTRITO, TIPO_IMOVEL, BAIRRO,
  SETOR_MUNICIPIO, SETOR_QUADRA, QUADRA, BAIRRO_LOGRADOURO, LOGRADOURO,
  CONTRIBUINTE, IMOVEL, AREA_IMOVEL, SECAO), pra levar as atualizações
  feitas no app de volta pro sistema legado:
  - **Duas opções de exportação**: "Somente alterados" (só o que foi
    incluído ou editado manualmente desde a importação) ou "Tudo"
    (todos os cadastros/boletins atuais). Nenhuma das duas marca nada
    como "já exportado" — sempre traz o acumulado completo desde a
    importação, mesmo repetindo registros já exportados antes (decisão
    explícita, pra nunca arriscar deixar algo de fora).
  - **Como funciona o "somente alterados"**: todo salvamento manual
    pela tela do app (criar ou editar um cadastro de apoio, boletim,
    contribuinte etc.) grava um campo interno `tocadoManualmente:
    true`. A importação do legado nunca grava esse campo — então ele
    sobrevive a reimportações e serve de sinal confiável do que foi
    tocado depois da base original. **(Substituído na v1.11 pela
    coleção `historico` já existente — ver changelog da v1.11: o campo
    só pegava edições feitas a partir desta versão, deixando de fora
    qualquer alteração manual anterior.)**
  - **IDs legados (sq_*) de registros novos**: um cadastro criado do
    zero dentro do app (sem vir da importação) não tem um sq_* de
    origem. Na primeira vez que ele é exportado, o app gera um código
    novo (faixa 900001+, que nunca colide com os sq_* da base legada
    de origem) e **grava esse código de volta no cadastro**, pra ele
    continuar o mesmo em exportações futuras — evita duplicar o mesmo
    registro no sistema legado se a planilha for reimportada mais de
    uma vez.
  - **Limitações conhecidas** (inerentes ao formato, documentadas na
    tela e aqui): fotos e croquis não são exportados (só existem no
    Storage do app, sem campo equivalente na planilha legada); os
    campos específicos do BCI (natureza, edificação, estrutura, padrão
    de acabamento etc.) não existem na planilha legada e por isso não
    entram na exportação; não existe aba de Condomínio no formato
    legado, então o vínculo `sq_condominio` do Imóvel fica em branco
    quando o boletim tem condomínio selecionado; valores numéricos de
    medida saem como número nativo do Excel (o arquivo original usava
    texto com vírgula) — mais robusto pra reimportar, mas é uma
    pequena diferença de formatação de célula, não de layout/abas.

- **v1.10** — A mesma tela **"Exportação de Alterações"** ganhou uma
  segunda opção de formato: **XML Contabilis**, no formato exigido
  para importar diretamente no sistema Contabilis da prefeitura (um
  arquivo `.xml` por tabela, todos compactados num `.zip`, no padrão
  `<?xml version="1.0" encoding="iso-8859-1" ?><CONTABILIS><NOME_TABELA>
  ...</NOME_TABELA></CONTABILIS>` confirmado em amostras reais exportadas
  do próprio Contabilis). O escopo (Tudo / Somente alterados) é o mesmo
  já existente pro XLSX — os dois formatos usam exatamente a mesma
  coleta/filtragem de dados e a mesma geração de código legado novo
  (`coletarDadosExportacao`, refatorado nesta versão a partir do que já
  existia), só a montagem final do arquivo é diferente.
  - **Tabelas exportadas em XML**: ZONA, DISTRITO, TIPO_IMOVEL, SECAO
    (sempre vazia — ver limitação já documentada), BAIRRO,
    SETOR_MUNICIPIO, QUADRA, SETOR_QUADRA, LOGRADOURO,
    BAIRRO_LOGRADOURO, CONDOMINIO, CONTRIBUINTE, IMOVEL, AREA_IMOVEL,
    PROPRIETARIO, TESTADA — as 13 tabelas já cobertas pelo XLSX mais as
    três que o XLSX/formato legado original não tinha (CONDOMINIO,
    PROPRIETARIO, TESTADA), confirmadas com amostras reais exportadas
    do próprio Contabilis depois de comparar a lista completa de
    ~250+ tabelas que o sistema aceita importar com o que o app já
    coleta no boletim.
  - **Arquivos numerados na ordem de importação recomendada**
    (`01_ZONA.xml`, `02_DISTRITO.xml`, ... `16_TESTADA.xml`),
    calculada pela dependência de chave estrangeira entre as tabelas —
    importar fora dessa ordem tende a gerar erro de "registro
    relacionado não encontrado" no Contabilis:
    `ZONA → DISTRITO → TIPO_IMOVEL → SECAO → BAIRRO (depende de ZONA)
    → SETOR_MUNICIPIO (depende de DISTRITO) → QUADRA →
    SETOR_QUADRA (depende de SETOR_MUNICIPIO + QUADRA) → LOGRADOURO →
    BAIRRO_LOGRADOURO (depende de BAIRRO + LOGRADOURO) → CONDOMINIO →
    CONTRIBUINTE → IMOVEL (depende de quase todas as anteriores) →
    AREA_IMOVEL (depende de IMOVEL) → PROPRIETARIO (depende de IMOVEL +
    CONTRIBUINTE) → TESTADA (depende de IMOVEL + LOGRADOURO)`.
  - **Codificação**: o Contabilis exige ISO-8859-1 (Latin-1), não
    UTF-8 — os arquivos são gravados byte a byte nessa codificação
    (função `paraBytesLatin1`), senão os acentos ficariam corrompidos
    mesmo com a declaração `encoding="iso-8859-1"` no cabeçalho do XML.
  - **Valores numéricos de medida** saem como texto com vírgula decimal
    (ex: `8,00`), igual ao padrão visto nas amostras do Contabilis —
    diferente do XLSX, que usa número nativo do Excel.
  - **CONDOMINIO**: o cadastro de Condomínio do app só guarda o nome —
    `qt_metroQuadrado`, `sq_logradouro`, `sq_bairro` e `tp_condominio`
    saem em branco por falta dessa informação no app. `sq_condominio`
    do IMOVEL agora é preenchido corretamente quando o boletim tem um
    condomínio selecionado.
  - **PROPRIETARIO**: uma linha pro proprietário principal do imóvel
    (campo "Contribuinte" do boletim) e uma linha por "Demais
    Proprietário" (item 11 do BCI, subcoleção `coProprietarios`:
    nome, CPF/CNPJ, percentual). Cada co-proprietário é resolvido pra
    um Contribuinte cadastrado comparando o CPF/CNPJ — se nenhum
    Contribuinte correspondente existir, aquele co-proprietário é
    **pulado** (nunca inventamos um `sq_contribuinte`) e um aviso
    aparece no log da exportação, listando nome/CPF, pra o usuário
    cadastrar o Contribuinte que falta e exportar de novo. O percentual
    do proprietário principal é **deduzido** como o restante até 100%
    (100% menos a soma dos percentuais dos demais) — o app não grava
    esse percentual explicitamente, então essa é uma suposição; revise
    se os percentuais no Contabilis não baterem com o esperado.
  - **TESTADA**: uma linha por testada preenchida (T1 a T4) no boletim.
    `fl_principal` sai "True" só pra T1 (suposição — o BCI não marca
    explicitamente qual testada é a principal) e `sq_logradouro` é
    sempre o logradouro do próprio imóvel (o boletim não grava um
    logradouro por testada). Testadas não preenchidas não geram linha.
  - **FATOR / FATOR_IMOVEL ignoradas de propósito**: confirmado com o
    cliente que esta prefeitura não tem nenhum fator de correção de
    IPTU cadastrado no Contabilis — essas duas tabelas foram deixadas
    de fora intencionalmente, não por falta de mapeamento. Pelas
    amostras, representariam um conceito de qualquer forma diferente
    das "Fatores de Qualidade do Imóvel" que o boletim já coleta
    (cobertura, forro, piso, conservação etc., que são atributos
    construtivos, não fatores de correção fiscal).

- **v1.11** — Detecção do "somente alterados" trocada pra usar a
  coleção `historico` (auditoria — "Histórico de Alterações" no menu,
  existe desde a v1.0) em vez do campo `tocadoManualmente` criado na
  v1.9. Motivo: `tocadoManualmente` só era gravado a partir da v1.9, ou
  seja, só enxergava edições feitas depois dessa versão subir — toda
  edição manual feita ANTES disso (praticamente toda a vida útil do
  app até aqui) ficaria de fora do "somente alterados" na primeira
  exportação, sem nenhum aviso. O histórico (`registrarHistorico()`)
  já registra "criar"/"editar" em todo salvamento manual desde o
  início, então usá-lo como fonte resolve isso de forma retroativa, sem
  precisar de nenhuma migração de dado. O campo `tocadoManualmente` foi
  removido de todos os formulários de salvamento (cadastros de apoio,
  localização, contribuintes, boletins) — ele não é mais gravado nem
  lido por nada.
  - **Como funciona agora**: pra cada coleção, a exportação consulta
    `historico` filtrando só por `colecao == <nome>` (um único filtro
    de igualdade — nunca precisa de índice composto) e, do lado do
    código, separa quais `documentoId` tiveram pelo menos um "criar" ou
    "editar". Pra Contribuintes e Boletins (que podem crescer bastante),
    esse conjunto de IDs é usado pra buscar só os documentos
    necessários (`buscarPorIds`, em lotes de 10), em vez de baixar a
    coleção inteira — continua nunca carregando mais do que precisa.
  - Resultado idêntico ao visto no "Tudo" quando não há nenhuma
    alteração manual registrada: a tela mostra "Nenhum registro foi
    incluído ou editado manualmente ainda" e não gera arquivo — mas
    agora isso só acontece quando é realmente verdade, não quando é só
    o app achando que nada foi tocado por não ter o campo novo.

- **v1.12** — Correção de um erro intermitente na exportação
  (`the stored version does not match the required base version`),
  que podia derrubar a exportação inteira em unidades gestoras com
  muitos registros novos (sem sq_* de origem) pra gerar código ao mesmo
  tempo. Causa raiz: várias tabelas resolvem os vínculos de cada linha
  em paralelo (`Promise.all`); quando duas linhas diferentes apontavam
  pro MESMO cadastro ainda sem código (ex: duas quadras do mesmo Setor
  novo), cada uma disparava sua própria transação pra gerar um código
  novo pro mesmo registro ao mesmo tempo, e as transações concorrentes
  no documento contador (`controleExportacao/contadores`) entravam em
  conflito. Corrigido fazendo chamadas concorrentes pro mesmo registro
  compartilharem uma única transação em andamento (deduplicação por
  coleção+ID), com uma segunda camada de nova tentativa automática (até
  6 vezes, com pequena espera) caso ainda assim aconteça uma disputa
  genuína entre registros diferentes. Sem isso, era preciso clicar em
  "Gerar arquivo" de novo e torcer pra não bater na mesma disputa.

- **v1.13** — A exportação agora confere o CNPJ da prefeitura/ente antes
  de começar: o `nu_cnpj` de todas as tabelas vem do cadastro em
  Administração → Prefeituras / Entes, e se esse campo estiver vazio o
  XML saía com `<nu_cnpj></nu_cnpj>` (tag vazia) e a importação no
  Contabilis falharia. Agora a exportação para com um aviso pedindo pra
  preencher o CNPJ, e o log mostra qual CNPJ está sendo usado.
- **v1.14** — Conferência tag a tag dos XMLs gerados contra os exemplos
  reais do Contabilis: as 13 tabelas exportadas (ZONA, DISTRITO,
  TIPO_IMOVEL, SECAO, BAIRRO, SETOR_MUNICIPIO, QUADRA, SETOR_QUADRA,
  LOGRADOURO, BAIRRO_LOGRADOURO, CONTRIBUINTE, IMOVEL, AREA_IMOVEL) têm
  exatamente as mesmas tags e na mesma ordem dos exemplos. Único ajuste
  de valor: TIPO_IMOVEL passa a sair com `fl_validarTerreno` e
  `fl_validarConstrucao` = "False" (como no exemplo). `nu_aliquota`
  (TIPO_IMOVEL) e `fl_irregular` (AREA_IMOVEL) continuam em branco porque
  o app não coleta esses dados. FATOR e FATOR_IMOVEL seguem ignorados.
- **v1.15** — Seção passa a existir no app. Antes, a aba SECAO e o
  `sq_secao` do IMOVEL da planilha legada eram ignorados na importação,
  então a exportação (XLSX e XML) saía sem seção. Agora: novo cadastro
  "Seções" (Cadastros de Apoio), campo "Seção" no boletim (bloco 03 —
  Localização), importação lê a aba SECAO e liga cada imóvel pelo
  `sq_secao`, e a exportação gera a tabela SECAO e preenche `sq_secao`
  no IMOVEL. Seção nova criada no app recebe código 900001+ como os
  demais cadastros. Para trazer a seção dos imóveis já importados é
  preciso reimportar a planilha (a importação é idempotente, mas
  atualiza os campos vindos da planilha). `nu_aliquota` e `fl_irregular`
  seguem em branco, por decisão do usuário.
- **v1.16** — Proprietário sempre vira Contribuinte. No Contabilis não há
  "proprietário" como cadastro: só Contribuinte. Antes, um proprietário
  (ou responsável) digitado no boletim e não encontrado pelo CPF/CNPJ
  ficava salvo só dentro do boletim — na exportação ele não entrava na
  tabela CONTRIBUINTE, o `sq_contribuinte` do IMOVEL saía em branco e ele
  ficava fora da PROPRIETARIO. Agora o boletim cria (ou reaproveita, pelo
  CPF/CNPJ) o Contribuinte ao salvar, e a exportação faz o mesmo para
  boletins antigos sem vínculo, gravando o vínculo no boletim. Boletim
  sem nome de proprietário continua saindo em branco, com aviso no log.
  Também corrigido um bug da v1.10: a função de busca de contribuinte da
  exportação tinha o mesmo nome da de `contribuintes.js` e a sobrescrevia
  (o boletim passava a não achar contribuinte por CPF com pontuação) —
  renomeada. Novo: o .zip da exportação XML agora traz
  `00_RELATORIO_CONFERENCIA.xlsx` (resumo + avisos, uma aba por tabela com
  as mesmas linhas dos XMLs e a aba IMOVEIS_LEGIVEL com nomes), só para
  conferência; não é importado no Contabilis.
- **v1.17** — Códigos de registros novos seguem a sequência do Contabilis.
  Antes, tudo que era criado no app recebia 900001 em diante. Agora o
  próximo número vem depois da última sequência de cada tabela do
  Contabilis (informada pelo usuário em 16/10/2026: bairro 31, quadra 40,
  logradouro 486, contribuinte 11397, imóvel 1267). Os valores ficam
  editáveis na tela Exportação de Alterações (documento
  `controleExportacao/ultimasSequencias`) — atualize antes de exportar se
  algo foi cadastrado direto no Contabilis. Tabelas sem valor informado
  (zona, distrito, tipo de imóvel, seção, setor, condomínio) seguem em
  900001+. Código já gerado antes nunca muda (usa o maior entre o já
  gerado e o informado). Limitação conhecida: no Contabilis uma quadra
  pode pertencer a vários setores (SETOR_QUADRA), e a importação do
  legado guarda só um setor por quadra.
