// ===================================================================
// EXPORTAÇÃO DE ALTERAÇÕES — formato legado (XLSX) e formato Contabilis (XML)
// ===================================================================
// Duas saídas possíveis, a partir dos MESMOS dados coletados:
//
// 1) XLSX no layout da planilha original de importação (ZONA, DISTRITO,
//    TIPO_IMOVEL, BAIRRO, SETOR_MUNICIPIO, SETOR_QUADRA, QUADRA,
//    BAIRRO_LOGRADOURO, LOGRADOURO, CONTRIBUINTE, IMOVEL, AREA_IMOVEL,
//    SECAO) — útil pra reimportar no sistema antigo.
//
// 2) XML no formato exigido pelo Contabilis — um arquivo .xml por
//    tabela (<CONTABILIS><NOME_TABELA>...</NOME_TABELA>...</CONTABILIS>,
//    um bloco <NOME_TABELA> por registro), todos compactados num .zip.
//    O layout de cada tabela foi tirado de exemplos reais exportados do
//    próprio Contabilis. A codificação é ISO-8859-1 (Latin-1), como o
//    Contabilis exige — por isso o arquivo é gravado byte a byte nessa
//    codificação, não em UTF-8.
//
// Duas opções de escopo (valem pros dois formatos):
// - "Tudo": todos os cadastros/boletins atuais da unidade gestora.
// - "Somente alterados": só o que tem `tocadoManualmente === true` —
//   esse campo é gravado em TODO salvamento manual pela tela do app
//   (criar ou editar um cadastro de apoio, um boletim, um contribuinte
//   etc.) e NUNCA pela importação do legado em si — então sobrevive a
//   reimportações e serve de sinal confiável de "o que foi tocado
//   depois da base original". Essa exportação nunca marca nada como
//   "já exportado": sempre traz o acumulado completo desde a
//   importação, mesmo que um registro já tenha saído numa exportação
//   anterior (decisão explícita do usuário, pra nunca arriscar deixar
//   algo de fora).
//
// IDs legados (sq_*): um registro que veio da planilha original
// guarda o sq_* de origem (`sqLegado` nos cadastros de apoio,
// `codigoLegado` em Logradouro/Contribuinte, `origemLegadoId` em
// Boletim/Imóvel). Um registro criado do ZERO dentro do app não tem
// sq_* original — na primeira vez que ele entra numa exportação (XLSX
// OU XML, tanto faz), o app gera um código novo (faixa 900001+, que
// nunca colide com os sq_* da base legada) e GRAVA esse código de
// volta no cadastro, pra ele continuar o MESMO em exportações futuras
// — isso evita duplicar o mesmo registro no destino se a exportação
// for repetida mais de uma vez.
//
// ORDEM DE IMPORTAÇÃO recomendada no Contabilis (respeita as
// dependências de chave estrangeira — importar fora dessa ordem tende
// a gerar erro de "registro relacionado não encontrado"):
//   1. ZONA           (sem dependência)
//   2. DISTRITO       (sem dependência)
//   3. TIPO_IMOVEL    (sem dependência)
//   4. SECAO          (sem dependência — fica sempre vazia, ver limitações)
//   5. BAIRRO         (depende de ZONA)
//   6. SETOR_MUNICIPIO(depende de DISTRITO)
//   7. QUADRA         (sem dependência)
//   8. SETOR_QUADRA   (depende de SETOR_MUNICIPIO + QUADRA)
//   9. LOGRADOURO     (sem dependência)
//  10. BAIRRO_LOGRADOURO (depende de BAIRRO + LOGRADOURO)
//  11. CONDOMINIO     (depende de LOGRADOURO + BAIRRO, quando preenchidos)
//  12. CONTRIBUINTE   (sem dependência)
//  13. IMOVEL         (depende de LOGRADOURO, TIPO_IMOVEL, BAIRRO, QUADRA,
//                       SETOR_MUNICIPIO, DISTRITO, CONTRIBUINTE, SECAO,
//                       CONDOMINIO)
//  14. AREA_IMOVEL    (depende de IMOVEL)
//  15. PROPRIETARIO   (depende de IMOVEL + CONTRIBUINTE)
//  16. TESTADA        (depende de IMOVEL + LOGRADOURO)
//
// Limitações conhecidas (documentadas também no README):
// - Fotos e croqui ficam só no Storage do app — não têm campo
//   equivalente utilizável na planilha/XML (gd_fotoImovel não é
//   exportado).
// - Os campos específicos do BCI (natureza, edificação, estrutura,
//   padrão de acabamento, etc.) não existem no formato legado/
//   Contabilis — ficam fora da exportação porque não têm coluna
//   correspondente confirmada.
// - `CONDOMINIO`: o cadastro de Condomínio do app só guarda o nome —
//   os campos `qt_metroQuadrado`, `sq_logradouro`, `sq_bairro` e
//   `tp_condominio` do Contabilis saem em branco por falta dessa
//   informação no app (dá pra preencher o cadastro de Condomínio com
//   mais campos numa próxima versão, se precisar).
// - `PROPRIETARIO`: o app só grava explicitamente o percentual dos
//   "Demais Proprietários" (item 11 do BCI, subcoleção
//   `coProprietarios` do boletim: nome, CPF/CNPJ, percentual). O
//   proprietário principal (campo "Contribuinte" do boletim) é
//   assumido como detentor do percentual restante (100% menos a soma
//   dos demais) — isso é uma suposição, não um dado gravado
//   explicitamente pelo usuário; revise se os percentuais no
//   Contabilis não baterem. Um co-proprietário cujo CPF/CNPJ não
//   corresponde a nenhum Contribuinte cadastrado é **pulado** (fica de
//   fora do PROPRIETARIO) e um aviso aparece no log da exportação —
//   nunca inventamos um `sq_contribuinte`.
// - `TESTADA`: cada testada preenchida (T1 a T4) no boletim gera uma
//   linha; `fl_principal` é "True" só para a T1 (suposição — o BCI não
//   marca explicitamente qual testada é a principal) e `sq_logradouro`
//   é sempre o logradouro do próprio imóvel (o boletim não grava um
//   logradouro por testada).
// - FATOR/FATOR_IMOVEL: confirmado com o cliente que não há fator de
//   correção de IPTU cadastrado no Contabilis desta prefeitura —
//   tabelas ignoradas de propósito, não por falta de mapeamento.
// - Valores numéricos de medida saem como texto com vírgula decimal no
//   XML (ex: "8,00") — igual ao padrão visto nas amostras do
//   Contabilis. No XLSX, saem como número nativo do Excel.

const BASE_CODIGO_LEGADO_NOVO = 900000;

const CAMPO_SQ_POR_COLECAO = {
  zonas: "sqLegado",
  distritos: "sqLegado",
  tiposImovel: "sqLegado",
  bairros: "sqLegado",
  setores: "sqLegado",
  quadras: "sqLegado",
  logradouros: "codigoLegado",
  contribuintes: "codigoLegado",
  boletins: "origemLegadoId",
  condominios: "sqLegado",
};

/**
 * Retorna o sq_* legado de um registro, gerando (e gravando de volta
 * no Firestore, pra ficar estável) um código novo se o registro nunca
 * teve um — ex: cadastro criado direto no app, sem vir da importação.
 */
async function obterOuGerarCodigoLegado(nomeColecao, registro) {
  if (!registro) return "";
  const campo = CAMPO_SQ_POR_COLECAO[nomeColecao];
  if (registro[campo]) return String(registro[campo]);

  const refContador = colecaoEntidade("controleExportacao").doc("contadores");
  const novoCodigo = await db.runTransaction(async (tx) => {
    const snap = await tx.get(refContador);
    const atual = snap.exists && snap.data()[nomeColecao] ? snap.data()[nomeColecao] : BASE_CODIGO_LEGADO_NOVO;
    const proximo = atual + 1;
    tx.set(refContador, { [nomeColecao]: proximo }, { merge: true });
    return proximo;
  });

  await colecaoEntidade(nomeColecao).doc(registro.id).update({ [campo]: String(novoCodigo) });
  registro[campo] = String(novoCodigo); // mantém o map local coerente pro resto da exportação
  return String(novoCodigo);
}

/** Busca por lotes (chunks de 10, limite do operador "in" do Firestore) documentos específicos por ID. */
async function buscarPorIds(nomeColecao, ids) {
  const resultado = new Map();
  const lista = Array.from(new Set(ids)).filter(Boolean);
  for (let i = 0; i < lista.length; i += 10) {
    const pedaco = lista.slice(i, i + 10);
    const snapshot = await colecaoEntidade(nomeColecao).where(firebase.firestore.FieldPath.documentId(), "in", pedaco).get();
    snapshot.docs.forEach((doc) => resultado.set(doc.id, { id: doc.id, ...doc.data() }));
  }
  return resultado;
}

/**
 * Procura um Contribuinte cadastrado pelo CPF/CNPJ normalizado — usado
 * pra resolver os "Demais Proprietários" (coProprietarios), que no
 * boletim são guardados como texto livre (nome/cpfCnpj/percentual),
 * sem um vínculo de ID com a coleção de Contribuintes. Retorna null se
 * não achar nenhum — nesse caso o co-proprietário é pulado na
 * exportação (nunca inventamos um sq_contribuinte).
 */
async function buscarContribuintePorCpfCnpj(cpfCnpjNormalizado) {
  if (!cpfCnpjNormalizado) return null;
  const snapshot = await colecaoEntidade("contribuintes").where("cpfCnpjNormalizado", "==", cpfCnpjNormalizado).limit(1).get();
  if (snapshot.docs.length === 0) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/** Carrega uma coleção inteira em lotes (cursor por ID), pra nunca disparar uma única consulta sem limite. */
async function buscarColecaoEmLotes(consultaBase) {
  const paginador = criarPaginador(consultaBase);
  const todos = [];
  while (paginador.temMais) {
    const pagina = await paginador.carregarProximaPagina();
    if (pagina.length === 0) break;
    todos.push(...pagina);
  }
  return todos;
}

/** Carrega os registros a exportar de uma coleção: tudo (paginado) ou só os tocados manualmente (conjunto já pequeno por definição). */
async function carregarParaExportacao(nomeColecao, somenteAlterados) {
  if (somenteAlterados) {
    const snapshot = await colecaoEntidade(nomeColecao).where("tocadoManualmente", "==", true).get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return buscarColecaoEmLotes(colecaoEntidade(nomeColecao).orderBy(firebase.firestore.FieldPath.documentId()));
}

function dataIsoParaDate(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return "";
  return new Date(ano, mes - 1, dia);
}

function numeroOuVazio(valor) {
  return valor === null || valor === undefined || valor === "" ? "" : Number(valor);
}

function textoOuVazio(valor) {
  return valor === null || valor === undefined ? "" : String(valor);
}

/** "8,00" no padrão brasileiro usado pelas amostras do Contabilis (vírgula decimal, 2 casas). */
function numeroBrOuVazio(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Number(valor);
  if (isNaN(numero)) return "";
  return numero.toFixed(2).replace(".", ",");
}

/** "AAAA-MM-DD" a partir da data ISO interna — formato mais seguro pra um XML de integração. */
function dataIsoOuVazio(iso) {
  return iso || "";
}

function logExportacao(mensagem) {
  const area = document.getElementById("area-log-exportacao");
  if (!area) return;
  const linha = document.createElement("div");
  linha.textContent = mensagem;
  area.appendChild(linha);
  area.scrollTop = area.scrollHeight;
}

// ===================================================================
// COLETA DE DADOS — compartilhada pelos dois formatos de exportação
// ===================================================================
async function coletarDadosExportacao(somenteAlterados, barra) {
  const cnpj = apenasDigitos(estado.entidadeAtualDados?.cnpj || "");

  barra.atualizarPercentual(5, "Lendo cadastros de apoio");
  const [zonasTodas, distritosTodos, tiposImovelTodos, bairrosTodos, setoresTodos, quadrasTodas, logradourosTodos, condominiosTodos] = await Promise.all([
    carregarListaCompleta("zonas"),
    carregarListaCompleta("distritos"),
    carregarListaCompleta("tiposImovel"),
    carregarListaCompleta("bairros"),
    carregarListaCompleta("setores"),
    carregarListaCompleta("quadras"),
    carregarListaCompleta("logradouros"),
    carregarListaCompleta("condominios"),
  ]);

  const mapaZonas = new Map(zonasTodas.map((r) => [r.id, r]));
  const mapaDistritos = new Map(distritosTodos.map((r) => [r.id, r]));
  const mapaTiposImovel = new Map(tiposImovelTodos.map((r) => [r.id, r]));
  const mapaBairros = new Map(bairrosTodos.map((r) => [r.id, r]));
  const mapaSetores = new Map(setoresTodos.map((r) => [r.id, r]));
  const mapaQuadras = new Map(quadrasTodas.map((r) => [r.id, r]));
  const mapaLogradouros = new Map(logradourosTodos.map((r) => [r.id, r]));
  const mapaCondominios = new Map(condominiosTodos.map((r) => [r.id, r]));

  const filtrar = (lista) => (somenteAlterados ? lista.filter((r) => r.tocadoManualmente) : lista);
  const zonasExport = filtrar(zonasTodas);
  const distritosExport = filtrar(distritosTodos);
  const tiposImovelExport = filtrar(tiposImovelTodos);
  const bairrosExport = filtrar(bairrosTodos);
  const setoresExport = filtrar(setoresTodos);
  const quadrasExport = filtrar(quadrasTodas);
  const logradourosExport = filtrar(logradourosTodos);
  const condominiosExport = filtrar(condominiosTodos);

  barra.atualizarPercentual(20, "Lendo contribuintes");
  const contribuintesExport = await carregarParaExportacao("contribuintes", somenteAlterados);
  const mapaContribuintes = new Map(contribuintesExport.map((r) => [r.id, r]));

  barra.atualizarPercentual(35, "Lendo boletins");
  const boletinsExport = await carregarParaExportacao("boletins", somenteAlterados);

  const idsContribuintesFaltando = [];
  boletinsExport.forEach((b) => {
    if (b.proprietarioContribuinteId && !mapaContribuintes.has(b.proprietarioContribuinteId)) idsContribuintesFaltando.push(b.proprietarioContribuinteId);
    if (b.responsavelContribuinteId && !mapaContribuintes.has(b.responsavelContribuinteId)) idsContribuintesFaltando.push(b.responsavelContribuinteId);
  });
  if (idsContribuintesFaltando.length > 0) {
    const extras = await buscarPorIds("contribuintes", idsContribuintesFaltando);
    extras.forEach((valor, chave) => mapaContribuintes.set(chave, valor));
  }

  logExportacao(
    `Registros a exportar: ${zonasExport.length} zonas, ${distritosExport.length} distritos, ${tiposImovelExport.length} tipos de imóvel, ${bairrosExport.length} bairros, ${setoresExport.length} setores, ${quadrasExport.length} quadras, ${logradourosExport.length} logradouros, ${contribuintesExport.length} contribuintes, ${boletinsExport.length} boletins.`
  );
  const nadaAExportar =
    somenteAlterados &&
    boletinsExport.length === 0 && contribuintesExport.length === 0 && zonasExport.length === 0 && distritosExport.length === 0 &&
    tiposImovelExport.length === 0 && bairrosExport.length === 0 && setoresExport.length === 0 && quadrasExport.length === 0 && logradourosExport.length === 0 &&
    condominiosExport.length === 0;
  if (nadaAExportar) {
    logExportacao("Nenhum registro foi incluído ou editado manualmente ainda — nada para exportar.");
    mostrarToast("Nenhuma alteração encontrada para exportar.", "info");
    return null;
  }

  barra.atualizarPercentual(55, "Resolvendo códigos legados");
  async function garantirCodigos(nomeColecao, lista) {
    for (const registro of lista) {
      await obterOuGerarCodigoLegado(nomeColecao, registro);
    }
  }
  await garantirCodigos("zonas", zonasExport);
  await garantirCodigos("distritos", distritosExport);
  await garantirCodigos("tiposImovel", tiposImovelExport);
  await garantirCodigos("bairros", bairrosExport);
  await garantirCodigos("setores", setoresExport);
  await garantirCodigos("quadras", quadrasExport);
  await garantirCodigos("logradouros", logradourosExport);
  await garantirCodigos("contribuintes", contribuintesExport);
  await garantirCodigos("condominios", condominiosExport);
  await garantirCodigos("boletins", boletinsExport);

  // Referenciados indiretamente (ex: boletim alterado aponta pra um
  // bairro que nunca foi tocado) também precisam de sq_* resolvido,
  // senão a coluna de vínculo sai em branco.
  async function sqDe(nomeColecao, mapa, id) {
    if (!id) return "";
    const registro = mapa.get(id);
    if (!registro) return "";
    return await obterOuGerarCodigoLegado(nomeColecao, registro);
  }

  return {
    cnpj,
    zonasExport, distritosExport, tiposImovelExport, bairrosExport, setoresExport, quadrasExport, logradourosExport, contribuintesExport, condominiosExport, boletinsExport,
    mapaZonas, mapaDistritos, mapaTiposImovel, mapaBairros, mapaSetores, mapaQuadras, mapaLogradouros, mapaContribuintes, mapaCondominios,
    sqDe,
  };
}

// ===================================================================
// TELA
// ===================================================================
async function renderizarExportacaoLegado(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Exportação de Alterações</h2>
    </div>
    <p class="texto-secundario">
      Gera os cadastros e boletins da unidade gestora num formato pra levar de volta a
      outro sistema: XLSX no layout da planilha original de importação, ou XML no formato
      do Contabilis (um arquivo por tabela, compactado em .zip).
    </p>
    <div class="linha-formulario" style="margin:16px 0">
      <label class="item-checkbox">
        <input type="radio" name="formato-exportacao" value="xlsx" checked>
        XLSX (mesmo layout/abas da planilha original de importação)
      </label>
      <label class="item-checkbox">
        <input type="radio" name="formato-exportacao" value="xml">
        XML Contabilis (um arquivo .xml por tabela, dentro de um .zip)
      </label>
    </div>
    <div class="linha-formulario" style="margin:16px 0">
      <label class="item-checkbox">
        <input type="radio" name="modo-exportacao" value="alterados" checked>
        Somente os registros incluídos ou editados manualmente desde a importação
      </label>
      <label class="item-checkbox">
        <input type="radio" name="modo-exportacao" value="tudo">
        Tudo (todos os cadastros e boletins atuais)
      </label>
    </div>
    <p class="texto-secundario">
      Essa exportação sempre traz o acumulado completo desde a importação — nunca marca
      nada como "já exportado", então um registro pode aparecer em mais de uma exportação.
    </p>
    <button class="botao-primario" id="btn-gerar-exportacao">⬇️ Gerar arquivo</button>
    <div id="area-progresso-exportacao" style="margin-top:16px"></div>
    <div id="area-log-exportacao" class="caixa-log-importacao"></div>
  `;

  document.getElementById("btn-gerar-exportacao").addEventListener("click", (evento) => {
    const somenteAlterados = document.querySelector('input[name="modo-exportacao"]:checked').value === "alterados";
    const formato = document.querySelector('input[name="formato-exportacao"]:checked').value;
    const funcao = formato === "xml" ? executarExportacaoContabilisXml : executarExportacaoLegado;
    executarComFeedback(evento.target, () => funcao(somenteAlterados), "Gerando...");
  });
}

// ===================================================================
// FORMATO 1 — XLSX no layout da planilha legada original
// ===================================================================
async function executarExportacaoLegado(somenteAlterados) {
  const barraContainer = document.getElementById("area-progresso-exportacao");
  barraContainer.innerHTML = "";
  const barra = criarBarraProgressoInline(barraContainer, "Lendo cadastros");
  document.getElementById("area-log-exportacao").innerHTML = "";

  try {
    const dados = await coletarDadosExportacao(somenteAlterados, barra);
    if (!dados) return;
    const {
      cnpj, zonasExport, distritosExport, tiposImovelExport, bairrosExport, setoresExport, quadrasExport, logradourosExport,
      contribuintesExport, boletinsExport, mapaZonas, mapaDistritos, mapaTiposImovel, mapaBairros, mapaSetores, mapaQuadras,
      mapaLogradouros, mapaContribuintes, sqDe,
    } = dados;

    barra.atualizarPercentual(70, "Montando planilha");
    const livro = XLSX.utils.book_new();

    function adicionarAba(nome, cabecalho, linhas) {
      const planilha = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
      XLSX.utils.book_append_sheet(livro, planilha, nome);
    }

    adicionarAba(
      "ZONA",
      [null, "nu_cnpj", "sq_zona", "nm_zona"],
      zonasExport.map((r) => [null, cnpj, r.sqLegado, textoOuVazio(r.nome)])
    );

    adicionarAba(
      "DISTRITO",
      [null, "nm_distrito", "sq_distrito", "nu_cnpj"],
      distritosExport.map((r) => [null, textoOuVazio(r.nome), r.sqLegado, cnpj])
    );

    adicionarAba(
      "TIPO_IMOVEL",
      [null, "nu_cnpj", "sq_tipoImovel", "nu_aliquota", "nm_tipoImovel", "ds_formulaIptu", "fl_rural", "ds_formulaValorVenal", "fl_validarTerreno", "fl_validarConstrucao"],
      tiposImovelExport.map((r) => [null, cnpj, r.sqLegado, "", textoOuVazio(r.nome), "", "", "", "", ""])
    );

    adicionarAba(
      "BAIRRO",
      [null, "nm_bairro", "sq_bairro", "nu_cnpj", "sq_zona", "dt_desativacao"],
      await Promise.all(
        bairrosExport.map(async (r) => [null, textoOuVazio(r.nome), r.sqLegado, cnpj, await sqDe("zonas", mapaZonas, r.zonaId), ""])
      )
    );

    adicionarAba(
      "SETOR_MUNICIPIO",
      [null, "nm_setor", "sq_setor", "sq_distrito", "nu_cnpj", "nu_setor"],
      await Promise.all(
        setoresExport.map(async (r) => [null, textoOuVazio(r.nome), r.sqLegado, await sqDe("distritos", mapaDistritos, r.distritoId), cnpj, textoOuVazio(r.codigo)])
      )
    );

    adicionarAba(
      "SETOR_QUADRA",
      [null, "sq_setor", "sq_quadra", "nu_cnpj", "dt_desativacao"],
      await Promise.all(
        quadrasExport.map(async (r) => [null, await sqDe("setores", mapaSetores, r.setorId), r.sqLegado, cnpj, ""])
      )
    );

    adicionarAba(
      "QUADRA",
      [null, "nm_quadra", "sq_quadra", "nu_cnpj", "nu_quadra"],
      quadrasExport.map((r) => [null, textoOuVazio(r.nome), r.sqLegado, cnpj, textoOuVazio(r.codigo)])
    );

    adicionarAba(
      "BAIRRO_LOGRADOURO",
      [null, "sq_bairro", "sq_logradouro", "nu_cnpj", "nu_cep", "vl_metroConstruido", "vl_metroTerreno"],
      await Promise.all(
        logradourosExport.map(async (r) => [null, await sqDe("bairros", mapaBairros, r.bairroId), r.codigoLegado, cnpj, textoOuVazio(r.cep), "", ""])
      )
    );

    adicionarAba(
      "LOGRADOURO",
      [null, "nm_logradouro", "sq_logradouro", "nu_cnpj", "tp_logradouro", "nu_lei", "nm_logradouroAnterior", "tp_origemLogradouro", "fl_apgi", "tp_tituloLogradouro"],
      logradourosExport.map((r) => [null, textoOuVazio(r.nome), r.codigoLegado, cnpj, textoOuVazio(r.tipo), "", "", "", "", ""])
    );

    adicionarAba(
      "CONTRIBUINTE",
      [
        null, "nm_contribuinte", "sq_contribuinte", "nu_cpfCnpjContribuinte", "nu_pis", "ds_logradouro", "ds_bairro", "nu_logradouro",
        "ds_complemento", "ds_email", "nu_cep", "nu_telefone", "nu_celular", "cd_municipio", "nu_cnpj", "sq_logradouro", "sq_bairro",
        "cd_pais", "nu_rg", "nu_cnh", "tp_cnh", "nu_crea", "ds_transferencia", "sg_orgaoExpedidorRg", "nu_nire", "dt_nire", "dt_nascimento",
        "dt_validadeCnh", "tp_orgaoClasse",
      ],
      contribuintesExport.map((r) => [
        null, textoOuVazio(r.nome), r.codigoLegado, textoOuVazio(r.cpfCnpj), "", textoOuVazio(r.endereco), textoOuVazio(r.bairro), "",
        "", textoOuVazio(r.email), textoOuVazio(r.cep), textoOuVazio(r.telefone), textoOuVazio(r.celular), "", cnpj, "", "",
        "", "", "", "", "", "", "", "", "", "",
        "", "",
      ])
    );

    adicionarAba(
      "SECAO",
      [null, "nu_cnpj", "sq_secao", "nm_secao", "nu_secao"],
      [] // não existe cadastro de Seção no app (também não existia na importação original)
    );

    const linhasImovel = [];
    const linhasArea = [];
    for (const r of boletinsExport) {
      const sqLogradouro = await sqDe("logradouros", mapaLogradouros, r.logradouroId);
      const sqBairro = await sqDe("bairros", mapaBairros, r.bairroId);
      const sqQuadra = await sqDe("quadras", mapaQuadras, r.quadraId);
      const sqSetor = await sqDe("setores", mapaSetores, r.setorId);
      const sqDistrito = await sqDe("distritos", mapaDistritos, r.distritoId);
      const sqTipoImovel = await sqDe("tiposImovel", mapaTiposImovel, r.tipoImovelId);
      const sqContribuinte = r.proprietarioContribuinteId ? await obterOuGerarCodigoLegado("contribuintes", mapaContribuintes.get(r.proprietarioContribuinteId)) : "";
      const sqContribuinteResponsavel =
        !r.mesmoResponsavelProprietario && r.responsavelContribuinteId
          ? await obterOuGerarCodigoLegado("contribuintes", mapaContribuintes.get(r.responsavelContribuinteId))
          : "";
      const sqImovel = r.origemLegadoId;

      linhasImovel.push([
        null, sqImovel, textoOuVazio(r.numero), sqLogradouro, textoOuVazio(r.complemento), textoOuVazio(r.inscricaoImobiliaria), textoOuVazio(r.inscricaoImobiliariaAnterior),
        textoOuVazio(r.lote), textoOuVazio(r.unidade), cnpj, sqTipoImovel, "" /* sq_condominio — layout da tabela CONDOMINIO não confirmado */, sqBairro, sqQuadra, sqSetor,
        textoOuVazio(r.observacao), sqContribuinte, "", "", "", "",
        "", r.corrMesmoProprietario ? textoOuVazio(r.numero) : textoOuVazio(r.corrNumero), r.corrMesmoProprietario ? textoOuVazio(r.logradouroNome) : textoOuVazio(r.corrEndereco),
        r.corrMesmoProprietario ? textoOuVazio(r.complemento) : textoOuVazio(r.corrComplemento), r.corrMesmoProprietario ? textoOuVazio(r.bairroNome) : textoOuVazio(r.corrBairro),
        "", "", dataIsoParaDate(r.dataCadastro), dataIsoParaDate(r.dataAtualizacao), textoOuVazio(r.medidorAgua), textoOuVazio(r.medidorEnergia),
        r.corrMesmoProprietario ? textoOuVazio(r.cep) : textoOuVazio(r.corrCep), "", sqDistrito, sqContribuinteResponsavel,
        "", "", "", "", numeroOuVazio(r.latitude), numeroOuVazio(r.longitude), "", "",
        "", "", "", "", "", "", numeroOuVazio(r.dimAreaUnidade), "", "",
        "", textoOuVazio(r.usuarioAtualizacaoNome), dataIsoParaDate(r.dataAtualizacao), "", "", numeroOuVazio(r.dimNumeroPavimentos),
        "", "", "", "", "", "", "", "", "",
      ]);

      const temArea = [
        r.areaTerrenoFrente, r.areaTerrenoFundo, r.areaTerrenoLadoDireito, r.areaTerrenoLadoEsquerdo, r.areaTerrenoTotal,
        r.areaConstruidaFrente, r.areaConstruidaFundo, r.areaConstruidaLadoDireito, r.areaConstruidaLadoEsquerdo, r.areaConstruidaTotal,
      ].some((v) => v !== null && v !== undefined && v !== "");
      if (temArea) {
        linhasArea.push([
          null, cnpj, sqImovel, sqImovel, numeroOuVazio(r.areaTerrenoFrente), numeroOuVazio(r.areaTerrenoFundo),
          numeroOuVazio(r.areaTerrenoLadoEsquerdo), numeroOuVazio(r.areaTerrenoLadoDireito), numeroOuVazio(r.areaConstruidaFrente),
          numeroOuVazio(r.areaConstruidaFundo), numeroOuVazio(r.areaConstruidaLadoEsquerdo), numeroOuVazio(r.areaConstruidaLadoDireito),
          "", numeroOuVazio(r.areaTerrenoTotal), numeroOuVazio(r.areaConstruidaTotal), "",
        ]);
      }
    }

    adicionarAba(
      "IMOVEL",
      [
        null, "sq_imovel", "nu_logradouro", "sq_logradouro", "ds_complemento", "nu_publico", "nu_publicoAnterior", "nu_lote", "nu_unidade", "nu_cnpj",
        "sq_tipoImovel", "sq_condominio", "sq_bairro", "sq_quadra", "sq_setor", "ds_observacao", "sq_contribuinte", "nu_escritura", "nu_livroRegistro",
        "nu_folhaLivroRegistro", "sq_cartorio", "fl_incidenciaImovel", "nu_logradouroCorrespondencia", "ds_logradouroCorrespondencia",
        "ds_complementoCorrespondencia", "ds_bairroCorrespondencia", "cd_pais", "cd_municipio", "dt_cadastro", "dt_alteracao", "nu_medidorAgua",
        "nu_medidorEnergia", "nu_cepCorrespondencia", "gd_fotoImovel", "sq_distrito", "sq_contribuinteResponsavel", "vl_imovelRural", "tp_calculoArea",
        "qt_areaRural", "dt_construcao", "nu_latitude", "nu_longitude", "dt_desmembramento", "dt_remembramento", "nu_setorLogradouro",
        "nu_quadraLogradouro", "nu_loteLogradouro", "sq_secao", "sq_loteamento", "sq_face", "vl_areaUnidade", "nu_apartamento", "nm_bloco",
        "dt_escritura", "nm_revisador", "dt_revisao", "dt_desativacao", "nu_habitese", "nu_pavimentos", "tp_documentoRegistro",
        "nu_processoRegistro", "dt_habitese", "sq_modoCadastral", "sq_motivoExclusao", "nu_laudoAvaliacao", "nu_processoAlteracao",
        "nu_processoExclusao", "nu_processoPenhora",
      ],
      linhasImovel
    );

    adicionarAba(
      "AREA_IMOVEL",
      [
        null, "nu_cnpj", "sq_imovel", "sq_areaImovel", "vl_frenteTerreno", "vl_fundoTerreno", "vl_ladoEsquerdoTerreno", "vl_ladoDireitoTerreno",
        "vl_frenteConstrucao", "vl_fundoConstrucao", "vl_ladoEsquerdoConstrucao", "vl_ladoDireitoConstrucao", "nm_areaImovel", "vl_totalTerreno",
        "vl_totalConstruido", "fl_irregular",
      ],
      linhasArea
    );

    barra.atualizarPercentual(95, "Gerando arquivo");
    const sufixo = somenteAlterados ? "alteracoes" : "completa";
    XLSX.writeFile(livro, `exportacao-${sufixo}-${dataLocalISO()}.xlsx`);

    barra.atualizarPercentual(100, "Concluído");
    logExportacao("✅ Planilha gerada com sucesso.");
    mostrarToast("Planilha gerada com sucesso.", "sucesso");
  } catch (erro) {
    console.error(erro);
    logExportacao(`❌ Erro durante a exportação: ${erro.message}`);
    mostrarToast("Erro durante a exportação. Veja o log na tela para detalhes.", "erro");
  } finally {
    barra.remover();
  }
}

// ===================================================================
// FORMATO 2 — XML Contabilis (um .xml por tabela, dentro de um .zip)
// ===================================================================

/** Escapa texto pra entrar como conteúdo de elemento XML. */
function escaparXml(valor) {
  const texto = textoOuVazio(valor);
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Converte uma string JS pros bytes ISO-8859-1 (Latin-1) que o
 * Contabilis exige — não dá pra simplesmente gravar como UTF-8 com a
 * tag de encoding dizendo "iso-8859-1", senão os acentos corrompem na
 * leitura. Caracteres fora do intervalo Latin-1 (fora do Português)
 * viram "?" — não deveria acontecer com dados digitados em português.
 */
function paraBytesLatin1(texto) {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    bytes[i] = codigo <= 0xff ? codigo : 0x3f; // "?" se sair do Latin-1
  }
  return bytes;
}

/** Monta o XML de uma tabela: um bloco <nomeTabela> por registro, dentro de <CONTABILIS>. */
function montarXmlTabela(nomeTabela, campos, registros) {
  const linhas = registros.map((registro) => {
    const camposXml = campos.map((campo) => `    <${campo}>${escaparXml(registro[campo])}</${campo}>`).join("\n");
    return `  <${nomeTabela}>\n${camposXml}\n  </${nomeTabela}>`;
  });
  return `<?xml version="1.0" encoding="iso-8859-1" ?>\n<CONTABILIS>\n${linhas.join("\n")}\n</CONTABILIS>\n`;
}

function baixarArquivoBinario(blob, nomeArquivo) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;
  link.click();
}

async function executarExportacaoContabilisXml(somenteAlterados) {
  if (typeof JSZip === "undefined") {
    mostrarToast("Biblioteca de compactação (JSZip) não carregou — confira sua conexão e recarregue a página.", "erro");
    return;
  }

  const barraContainer = document.getElementById("area-progresso-exportacao");
  barraContainer.innerHTML = "";
  const barra = criarBarraProgressoInline(barraContainer, "Lendo cadastros");
  document.getElementById("area-log-exportacao").innerHTML = "";

  try {
    const dados = await coletarDadosExportacao(somenteAlterados, barra);
    if (!dados) return;
    const {
      cnpj, zonasExport, distritosExport, tiposImovelExport, bairrosExport, setoresExport, quadrasExport, logradourosExport,
      contribuintesExport, condominiosExport, boletinsExport, mapaZonas, mapaDistritos, mapaTiposImovel, mapaBairros, mapaSetores, mapaQuadras,
      mapaLogradouros, mapaContribuintes, mapaCondominios, sqDe,
    } = dados;

    const avisos = [];
    barra.atualizarPercentual(70, "Montando as tabelas");

    // Cada tabela: { campos: [ordem dos campos no XML], linhas: [{campo: valor}] }
    const tabelas = {};

    tabelas.ZONA = {
      campos: ["nu_cnpj", "sq_zona", "nm_zona"],
      linhas: zonasExport.map((r) => ({ nu_cnpj: cnpj, sq_zona: r.sqLegado, nm_zona: r.nome })),
    };

    tabelas.DISTRITO = {
      campos: ["nm_distrito", "sq_distrito", "nu_cnpj"],
      linhas: distritosExport.map((r) => ({ nm_distrito: r.nome, sq_distrito: r.sqLegado, nu_cnpj: cnpj })),
    };

    tabelas.TIPO_IMOVEL = {
      campos: ["nu_cnpj", "sq_tipoImovel", "nu_aliquota", "nm_tipoImovel", "ds_formulaIptu", "fl_rural", "ds_formulaValorVenal", "fl_validarTerreno", "fl_validarConstrucao"],
      linhas: tiposImovelExport.map((r) => ({ nu_cnpj: cnpj, sq_tipoImovel: r.sqLegado, nu_aliquota: "", nm_tipoImovel: r.nome, ds_formulaIptu: "", fl_rural: "", ds_formulaValorVenal: "", fl_validarTerreno: "", fl_validarConstrucao: "" })),
    };

    tabelas.SECAO = {
      campos: ["nu_cnpj", "sq_secao", "nm_secao", "nu_secao"],
      linhas: [], // não existe cadastro de Seção no app
    };

    tabelas.BAIRRO = {
      campos: ["nm_bairro", "sq_bairro", "nu_cnpj", "sq_zona", "dt_desativacao"],
      linhas: await Promise.all(
        bairrosExport.map(async (r) => ({ nm_bairro: r.nome, sq_bairro: r.sqLegado, nu_cnpj: cnpj, sq_zona: await sqDe("zonas", mapaZonas, r.zonaId), dt_desativacao: "" }))
      ),
    };

    tabelas.SETOR_MUNICIPIO = {
      campos: ["nm_setor", "sq_setor", "sq_distrito", "nu_cnpj", "nu_setor"],
      linhas: await Promise.all(
        setoresExport.map(async (r) => ({ nm_setor: r.nome, sq_setor: r.sqLegado, sq_distrito: await sqDe("distritos", mapaDistritos, r.distritoId), nu_cnpj: cnpj, nu_setor: textoOuVazio(r.codigo) }))
      ),
    };

    tabelas.QUADRA = {
      campos: ["nm_quadra", "sq_quadra", "nu_cnpj", "nu_quadra"],
      linhas: quadrasExport.map((r) => ({ nm_quadra: r.nome, sq_quadra: r.sqLegado, nu_cnpj: cnpj, nu_quadra: r.codigo })),
    };

    tabelas.SETOR_QUADRA = {
      campos: ["sq_setor", "sq_quadra", "nu_cnpj", "dt_desativacao"],
      linhas: await Promise.all(
        quadrasExport.map(async (r) => ({ sq_setor: await sqDe("setores", mapaSetores, r.setorId), sq_quadra: r.sqLegado, nu_cnpj: cnpj, dt_desativacao: "" }))
      ),
    };

    tabelas.LOGRADOURO = {
      campos: ["nm_logradouro", "sq_logradouro", "nu_cnpj", "tp_logradouro", "nu_lei", "nm_logradouroAnterior", "tp_origemLogradouro", "fl_apgi", "tp_tituloLogradouro"],
      linhas: logradourosExport.map((r) => ({
        nm_logradouro: r.nome, sq_logradouro: r.codigoLegado, nu_cnpj: cnpj, tp_logradouro: r.tipo || "",
        nu_lei: "", nm_logradouroAnterior: "", tp_origemLogradouro: "", fl_apgi: "", tp_tituloLogradouro: "",
      })),
    };

    tabelas.BAIRRO_LOGRADOURO = {
      campos: ["sq_bairro", "sq_logradouro", "nu_cnpj", "nu_cep", "vl_metroConstruido", "vl_metroTerreno"],
      linhas: await Promise.all(
        logradourosExport.map(async (r) => ({ sq_bairro: await sqDe("bairros", mapaBairros, r.bairroId), sq_logradouro: r.codigoLegado, nu_cnpj: cnpj, nu_cep: r.cep || "", vl_metroConstruido: "", vl_metroTerreno: "" }))
      ),
    };

    // O cadastro de Condomínio do app só guarda o nome — os campos de
    // metragem/logradouro/bairro/tipo do Contabilis saem em branco por
    // falta dessa informação (ver limitação no cabeçalho do arquivo).
    tabelas.CONDOMINIO = {
      campos: ["nu_cnpj", "nu_logradouro", "nm_condominio", "sq_condominio", "qt_metroQuadrado", "sq_logradouro", "sq_bairro", "tp_condominio"],
      linhas: condominiosExport.map((r) => ({
        nu_cnpj: cnpj, nu_logradouro: "", nm_condominio: r.nome, sq_condominio: r.sqLegado,
        qt_metroQuadrado: "", sq_logradouro: "", sq_bairro: "", tp_condominio: "",
      })),
    };

    tabelas.CONTRIBUINTE = {
      campos: [
        "nm_contribuinte", "sq_contribuinte", "nu_cpfCnpjContribuinte", "nu_pis", "ds_logradouro", "ds_bairro", "nu_logradouro",
        "ds_complemento", "ds_email", "nu_cep", "nu_telefone", "nu_celular", "cd_municipio", "nu_cnpj", "sq_logradouro", "sq_bairro",
        "cd_pais", "nu_rg", "nu_cnh", "tp_cnh", "nu_crea", "ds_transferencia", "sg_orgaoExpedidorRg", "nu_nire", "dt_nire", "dt_nascimento",
        "dt_validadeCnh", "tp_orgaoClasse",
      ],
      linhas: contribuintesExport.map((r) => ({
        nm_contribuinte: r.nome, sq_contribuinte: r.codigoLegado, nu_cpfCnpjContribuinte: r.cpfCnpjNormalizado || apenasDigitos(r.cpfCnpj),
        nu_pis: "", ds_logradouro: r.endereco || "", ds_bairro: r.bairro || "", nu_logradouro: "", ds_complemento: "", ds_email: r.email || "",
        nu_cep: r.cep || "", nu_telefone: r.telefone || "", nu_celular: r.celular || "", cd_municipio: "", nu_cnpj: cnpj, sq_logradouro: "", sq_bairro: "",
        cd_pais: "76" /* Brasil — assumido, o app não distingue estrangeiros */, nu_rg: "", nu_cnh: "", tp_cnh: "", nu_crea: "", ds_transferencia: "",
        sg_orgaoExpedidorRg: "", nu_nire: "", dt_nire: "", dt_nascimento: "", dt_validadeCnh: "", tp_orgaoClasse: "",
      })),
    };

    const linhasImovel = [];
    const linhasArea = [];
    const linhasProprietario = [];
    const linhasTestada = [];
    for (const r of boletinsExport) {
      const sqLogradouro = await sqDe("logradouros", mapaLogradouros, r.logradouroId);
      const sqBairro = await sqDe("bairros", mapaBairros, r.bairroId);
      const sqQuadra = await sqDe("quadras", mapaQuadras, r.quadraId);
      const sqSetor = await sqDe("setores", mapaSetores, r.setorId);
      const sqDistrito = await sqDe("distritos", mapaDistritos, r.distritoId);
      const sqTipoImovel = await sqDe("tiposImovel", mapaTiposImovel, r.tipoImovelId);
      const sqCondominio = await sqDe("condominios", mapaCondominios, r.condominioId);
      const sqContribuinte = r.proprietarioContribuinteId ? await obterOuGerarCodigoLegado("contribuintes", mapaContribuintes.get(r.proprietarioContribuinteId)) : "";
      const sqContribuinteResponsavel =
        !r.mesmoResponsavelProprietario && r.responsavelContribuinteId
          ? await obterOuGerarCodigoLegado("contribuintes", mapaContribuintes.get(r.responsavelContribuinteId))
          : "";
      const sqImovel = r.origemLegadoId;

      // -------- PROPRIETARIO: proprietário principal + "Demais Proprietários" --------
      // O app só grava o percentual explícito dos demais proprietários
      // (subcoleção coProprietarios) — o percentual do proprietário
      // principal é deduzido como o restante até 100%. Ver limitação
      // documentada no cabeçalho do arquivo.
      const snapshotCoProprietarios = await colecaoEntidade("boletins").doc(r.id).collection("coProprietarios").get();
      const coProprietarios = snapshotCoProprietarios.docs.map((d) => ({ id: d.id, ...d.data() }));
      let somaPercentualDemais = 0;
      let numeroProprietario = 1;
      for (const co of coProprietarios) {
        const percentual = Number(co.percentual) || 0;
        somaPercentualDemais += percentual;
        const contribuinteCo = await buscarContribuintePorCpfCnpj(apenasDigitos(co.cpfCnpj));
        if (!contribuinteCo) {
          avisos.push(`Imóvel ${sqImovel}: co-proprietário "${co.nome || co.cpfCnpj}" não tem um Contribuinte cadastrado com esse CPF/CNPJ — não entrou no PROPRIETARIO.`);
          continue;
        }
        const sqContribuinteCo = await obterOuGerarCodigoLegado("contribuintes", contribuinteCo);
        numeroProprietario += 1;
        linhasProprietario.push({
          sq_imovel: sqImovel, sq_contribuinte: sqContribuinteCo, sq_proprietario: numeroProprietario, nu_percentualQuota: numeroBrOuVazio(percentual), nu_cnpj: cnpj,
        });
      }
      if (sqContribuinte) {
        linhasProprietario.unshift({
          sq_imovel: sqImovel, sq_contribuinte: sqContribuinte, sq_proprietario: 1,
          nu_percentualQuota: numeroBrOuVazio(Math.max(0, 100 - somaPercentualDemais)), nu_cnpj: cnpj,
        });
      }

      // -------- TESTADA: uma linha por testada preenchida (T1 a T4) --------
      [r.dimTestadaT1, r.dimTestadaT2, r.dimTestadaT3, r.dimTestadaT4].forEach((valor, indice) => {
        if (valor === null || valor === undefined || valor === "") return;
        linhasTestada.push({
          nu_cnpj: cnpj, sq_imovel: sqImovel, sq_tesdada: indice + 1, vl_testada: numeroBrOuVazio(valor),
          fl_principal: indice === 0 ? "True" : "False", sq_logradouro: sqLogradouro,
        });
      });

      linhasImovel.push({
        sq_imovel: sqImovel, nu_logradouro: r.numero || "", sq_logradouro: sqLogradouro, ds_complemento: r.complemento || "",
        nu_publico: r.inscricaoImobiliaria || "", nu_publicoAnterior: r.inscricaoImobiliariaAnterior || "", nu_lote: r.lote || "", nu_unidade: r.unidade || "",
        nu_cnpj: cnpj, sq_tipoImovel: sqTipoImovel, sq_condominio: sqCondominio, sq_bairro: sqBairro, sq_quadra: sqQuadra, sq_setor: sqSetor,
        ds_observacao: r.observacao || "", sq_contribuinte: sqContribuinte, nu_escritura: "", nu_livroRegistro: "", nu_folhaLivroRegistro: "", sq_cartorio: "",
        fl_incidenciaImovel: "1", nu_logradouroCorrespondencia: r.corrMesmoProprietario ? (r.numero || "") : (r.corrNumero || ""),
        ds_logradouroCorrespondencia: r.corrMesmoProprietario ? (r.logradouroNome || "") : (r.corrEndereco || ""),
        ds_complementoCorrespondencia: r.corrMesmoProprietario ? (r.complemento || "") : (r.corrComplemento || ""),
        ds_bairroCorrespondencia: r.corrMesmoProprietario ? (r.bairroNome || "") : (r.corrBairro || ""),
        cd_pais: "", cd_municipio: "", dt_cadastro: dataIsoOuVazio(r.dataCadastro), dt_alteracao: dataIsoOuVazio(r.dataAtualizacao),
        nu_medidorAgua: r.medidorAgua || "", nu_medidorEnergia: r.medidorEnergia || "",
        nu_cepCorrespondencia: r.corrMesmoProprietario ? (r.cep || "") : (r.corrCep || ""), gd_fotoImovel: "", sq_distrito: sqDistrito,
        sq_contribuinteResponsavel: sqContribuinteResponsavel, vl_imovelRural: "", tp_calculoArea: "", qt_areaRural: "", dt_construcao: "",
        nu_latitude: numeroOuVazio(r.latitude), nu_longitude: numeroOuVazio(r.longitude), dt_desmembramento: "", dt_remembramento: "",
        nu_setorLogradouro: "", nu_quadraLogradouro: "", nu_loteLogradouro: "", sq_secao: "", sq_loteamento: "", sq_face: "",
        vl_areaUnidade: numeroBrOuVazio(r.dimAreaUnidade), nu_apartamento: "", nm_bloco: "", dt_escritura: "",
        nm_revisador: r.usuarioAtualizacaoNome || "", dt_revisao: dataIsoOuVazio(r.dataAtualizacao), dt_desativacao: "", nu_habitese: "",
        nu_pavimentos: numeroOuVazio(r.dimNumeroPavimentos), tp_documentoRegistro: "", nu_processoRegistro: "", dt_habitese: "",
        sq_modoCadastral: "", sq_motivoExclusao: "", nu_laudoAvaliacao: "", nu_processoAlteracao: "", nu_processoExclusao: "", nu_processoPenhora: "",
        cd_cib: "",
      });

      const temArea = [
        r.areaTerrenoFrente, r.areaTerrenoFundo, r.areaTerrenoLadoDireito, r.areaTerrenoLadoEsquerdo, r.areaTerrenoTotal,
        r.areaConstruidaFrente, r.areaConstruidaFundo, r.areaConstruidaLadoDireito, r.areaConstruidaLadoEsquerdo, r.areaConstruidaTotal,
      ].some((v) => v !== null && v !== undefined && v !== "");
      if (temArea) {
        linhasArea.push({
          nu_cnpj: cnpj, sq_imovel: sqImovel, sq_areaImovel: sqImovel,
          vl_frenteTerreno: numeroBrOuVazio(r.areaTerrenoFrente), vl_fundoTerreno: numeroBrOuVazio(r.areaTerrenoFundo),
          vl_ladoEsquerdoTerreno: numeroBrOuVazio(r.areaTerrenoLadoEsquerdo), vl_ladoDireitoTerreno: numeroBrOuVazio(r.areaTerrenoLadoDireito),
          vl_frenteConstrucao: numeroBrOuVazio(r.areaConstruidaFrente), vl_fundoConstrucao: numeroBrOuVazio(r.areaConstruidaFundo),
          vl_ladoEsquerdoConstrucao: numeroBrOuVazio(r.areaConstruidaLadoEsquerdo), vl_ladoDireitoConstrucao: numeroBrOuVazio(r.areaConstruidaLadoDireito),
          nm_areaImovel: "PRINCIPAL", vl_totalTerreno: numeroBrOuVazio(r.areaTerrenoTotal), vl_totalConstruido: numeroBrOuVazio(r.areaConstruidaTotal),
          fl_irregular: "",
        });
      }
    }

    tabelas.IMOVEL = {
      campos: [
        "sq_imovel", "nu_logradouro", "sq_logradouro", "ds_complemento", "nu_publico", "nu_publicoAnterior", "nu_lote", "nu_unidade", "nu_cnpj",
        "sq_tipoImovel", "sq_condominio", "sq_bairro", "sq_quadra", "sq_setor", "ds_observacao", "sq_contribuinte", "nu_escritura", "nu_livroRegistro",
        "nu_folhaLivroRegistro", "sq_cartorio", "fl_incidenciaImovel", "nu_logradouroCorrespondencia", "ds_logradouroCorrespondencia",
        "ds_complementoCorrespondencia", "ds_bairroCorrespondencia", "cd_pais", "cd_municipio", "dt_cadastro", "dt_alteracao", "nu_medidorAgua",
        "nu_medidorEnergia", "nu_cepCorrespondencia", "gd_fotoImovel", "sq_distrito", "sq_contribuinteResponsavel", "vl_imovelRural", "tp_calculoArea",
        "qt_areaRural", "dt_construcao", "nu_latitude", "nu_longitude", "dt_desmembramento", "dt_remembramento", "nu_setorLogradouro",
        "nu_quadraLogradouro", "nu_loteLogradouro", "sq_secao", "sq_loteamento", "sq_face", "vl_areaUnidade", "nu_apartamento", "nm_bloco",
        "dt_escritura", "nm_revisador", "dt_revisao", "dt_desativacao", "nu_habitese", "nu_pavimentos", "tp_documentoRegistro",
        "nu_processoRegistro", "dt_habitese", "sq_modoCadastral", "sq_motivoExclusao", "nu_laudoAvaliacao", "nu_processoAlteracao",
        "nu_processoExclusao", "nu_processoPenhora", "cd_cib",
      ],
      linhas: linhasImovel,
    };

    tabelas.AREA_IMOVEL = {
      campos: [
        "nu_cnpj", "sq_imovel", "sq_areaImovel", "vl_frenteTerreno", "vl_fundoTerreno", "vl_ladoEsquerdoTerreno", "vl_ladoDireitoTerreno",
        "vl_frenteConstrucao", "vl_fundoConstrucao", "vl_ladoEsquerdoConstrucao", "vl_ladoDireitoConstrucao", "nm_areaImovel", "vl_totalTerreno",
        "vl_totalConstruido", "fl_irregular",
      ],
      linhas: linhasArea,
    };

    tabelas.PROPRIETARIO = {
      campos: ["sq_imovel", "sq_contribuinte", "sq_proprietario", "nu_percentualQuota", "nu_cnpj"],
      linhas: linhasProprietario,
    };

    tabelas.TESTADA = {
      campos: ["nu_cnpj", "sq_imovel", "sq_tesdada", "vl_testada", "fl_principal", "sq_logradouro"],
      linhas: linhasTestada,
    };

    // -------- Gera um .xml por tabela, nessa ordem (respeita as dependências — ver cabeçalho do arquivo) --------
    barra.atualizarPercentual(90, "Compactando arquivos XML");
    const ordemTabelas = [
      "ZONA", "DISTRITO", "TIPO_IMOVEL", "SECAO", "BAIRRO", "SETOR_MUNICIPIO", "QUADRA", "SETOR_QUADRA",
      "LOGRADOURO", "BAIRRO_LOGRADOURO", "CONDOMINIO", "CONTRIBUINTE", "IMOVEL", "AREA_IMOVEL", "PROPRIETARIO", "TESTADA",
    ];
    const zip = new JSZip();
    ordemTabelas.forEach((nomeTabela, indice) => {
      const tabela = tabelas[nomeTabela];
      const xml = montarXmlTabela(nomeTabela, tabela.campos, tabela.linhas);
      const prefixo = String(indice + 1).padStart(2, "0");
      zip.file(`${prefixo}_${nomeTabela}.xml`, paraBytesLatin1(xml), { binary: true });
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const sufixo = somenteAlterados ? "alteracoes" : "completa";
    baixarArquivoBinario(blob, `exportacao-contabilis-${sufixo}-${dataLocalISO()}.zip`);

    avisos.forEach((aviso) => logExportacao(`⚠️ ${aviso}`));
    barra.atualizarPercentual(100, "Concluído");
    logExportacao("✅ Arquivos XML gerados com sucesso (compactados em .zip). Os arquivos já saem numerados na ordem de importação recomendada.");
    mostrarToast(avisos.length > 0 ? "Arquivos gerados com avisos — veja o log." : "Arquivos XML gerados com sucesso.", avisos.length > 0 ? "aviso" : "sucesso");
  } catch (erro) {
    console.error(erro);
    logExportacao(`❌ Erro durante a exportação: ${erro.message}`);
    mostrarToast("Erro durante a exportação. Veja o log na tela para detalhes.", "erro");
  } finally {
    barra.remover();
  }
}
