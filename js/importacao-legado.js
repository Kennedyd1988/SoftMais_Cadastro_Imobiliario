// ===================================================================
// IMPORTAÇÃO DA BASE LEGADA (planilha XLSX exportada do sistema antigo)
// ===================================================================
// Lê as abas ZONA, DISTRITO, TIPO_IMOVEL, BAIRRO, SETOR_MUNICIPIO,
// SETOR_QUADRA, QUADRA, BAIRRO_LOGRADOURO, LOGRADOURO, CONTRIBUINTE,
// IMOVEL e AREA_IMOVEL (nessa ordem, respeitando os vínculos entre
// elas) e cria/atualiza os cadastros de apoio e os boletins.
//
// Idempotência: cada documento importado usa um ID determinístico
// (`legado_<sq_...>`), então rodar a importação de novo com a mesma
// planilha (ou uma versão atualizada dela) NUNCA duplica registros —
// só atualiza os que já existem (merge: true). Isso segue o mesmo
// padrão de idempotência já usado no app de igrejas (origemAppSheetId).
//
// Não existe aba de Condomínio na planilha legada — o campo fica
// vazio na importação; cadastre os condomínios manualmente depois,
// se necessário, e edite os boletins correspondentes.

function parseNumeroBR(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return valor;
  const texto = String(valor).trim().replace(/\./g, "").replace(",", ".");
  const numero = parseFloat(texto);
  return isNaN(numero) ? null : numero;
}

function parseDataLegado(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !isNaN(valor)) return dataLocalISO(valor);
  return null;
}

async function renderizarImportacaoLegado(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Importação do Legado</h2>
    </div>
    <p class="texto-secundario">
      Envie a planilha XLSX exportada do sistema antigo (abas ZONA, DISTRITO,
      TIPO_IMOVEL, BAIRRO, SETOR_MUNICIPIO, SETOR_QUADRA, QUADRA,
      BAIRRO_LOGRADOURO, LOGRADOURO, CONTRIBUINTE, IMOVEL e AREA_IMOVEL).
      Pode rodar mais de uma vez com segurança — registros já importados
      são atualizados, nunca duplicados.
    </p>
    <input type="file" id="campo-arquivo-legado" accept=".xlsx,.xls">
    <button class="botao-primario" id="btn-iniciar-importacao" style="margin-top:10px" disabled>Iniciar Importação</button>
    <div id="area-progresso-importacao" style="margin-top:16px"></div>
    <div id="area-log-importacao" class="caixa-log-importacao"></div>
  `;

  let arquivoSelecionado = null;
  document.getElementById("campo-arquivo-legado").addEventListener("change", (evento) => {
    arquivoSelecionado = evento.target.files[0] || null;
    document.getElementById("btn-iniciar-importacao").disabled = !arquivoSelecionado;
  });

  document.getElementById("btn-iniciar-importacao").addEventListener("click", (evento) => {
    if (!arquivoSelecionado) return;
    if (!confirm("Confirma a importação? Isso vai criar/atualizar cadastros de apoio e boletins nesta unidade gestora.")) return;
    executarComFeedback(evento.target, () => executarImportacaoLegado(arquivoSelecionado), "Importando...");
  });
}

function logImportacao(mensagem) {
  const area = document.getElementById("area-log-importacao");
  const linha = document.createElement("div");
  linha.textContent = mensagem;
  area.appendChild(linha);
  area.scrollTop = area.scrollHeight;
}

async function commitEmLotes(operacoes) {
  // Firestore permite no máximo 500 operações por batch — processamos
  // em lotes de 400 pra manter margem de segurança.
  for (let i = 0; i < operacoes.length; i += 400) {
    const lote = db.batch();
    operacoes.slice(i, i + 400).forEach((op) => op(lote));
    await lote.commit();
  }
}

async function executarImportacaoLegado(arquivo) {
  const barraContainer = document.getElementById("area-progresso-importacao");
  barraContainer.innerHTML = "";
  const barra = criarBarraProgressoInline(barraContainer, "Lendo planilha");
  document.getElementById("area-log-importacao").innerHTML = "";

  try {
    const bufferArquivo = await arquivo.arrayBuffer();
    const livro = XLSX.read(bufferArquivo, { cellDates: true });

    function lerAba(nome) {
      const planilha = livro.Sheets[nome];
      if (!planilha) return [];
      return XLSX.utils.sheet_to_json(planilha, { defval: "" });
    }

    const zonas = lerAba("ZONA");
    const distritos = lerAba("DISTRITO");
    const tiposImovel = lerAba("TIPO_IMOVEL");
    const secoes = lerAba("SECAO");
    const bairros = lerAba("BAIRRO");
    const setoresMunicipio = lerAba("SETOR_MUNICIPIO");
    const setorQuadra = lerAba("SETOR_QUADRA");
    const quadras = lerAba("QUADRA");
    const bairroLogradouro = lerAba("BAIRRO_LOGRADOURO");
    const logradouros = lerAba("LOGRADOURO");
    const contribuintes = lerAba("CONTRIBUINTE");
    const imoveis = lerAba("IMOVEL");
    const areasImovel = lerAba("AREA_IMOVEL");

    logImportacao(`Planilha lida: ${imoveis.length} imóveis, ${contribuintes.length} contribuintes.`);

    // -------- 1. ZONAS --------
    barra.atualizarPercentual(5, "Importando zonas");
    const mapaZonas = {};
    await commitEmLotes(
      zonas.map((linha) => (lote) => {
        const id = `legado_zona_${linha.sq_zona}`;
        mapaZonas[linha.sq_zona] = { id, nome: linha.nm_zona };
        lote.set(colecaoEntidade("zonas").doc(id), { nome: linha.nm_zona, nomeNormalizado: normalizarTexto(linha.nm_zona), sqLegado: String(linha.sq_zona) }, { merge: true });
      })
    );

    // -------- 2. DISTRITOS --------
    // A planilha legada não traz um código numérico próprio de
    // distrito (só o nome do lugar) — usamos a ordem de aparição como
    // código sequencial (01, 02, ...), necessário pro padrão de
    // inscrição imobiliária (Distrito(2).Setor(2).Quadra(3).Lote(4).Unidade(3)).
    barra.atualizarPercentual(10, "Importando distritos");
    const mapaDistritos = {};
    await commitEmLotes(
      distritos.map((linha, indice) => (lote) => {
        const id = `legado_distrito_${linha.sq_distrito}`;
        const codigo = preencherZeros(String(indice + 1), 2);
        mapaDistritos[linha.sq_distrito] = { id, nome: linha.nm_distrito, codigo };
        lote.set(colecaoEntidade("distritos").doc(id), { nome: linha.nm_distrito, nomeNormalizado: normalizarTexto(linha.nm_distrito), codigo, sqLegado: String(linha.sq_distrito) }, { merge: true });
      })
    );

    // -------- 2b. SEÇÕES --------
    // A aba SECAO (nm_secao, ex: "10144D") liga-se ao imóvel por
    // IMOVEL.sq_secao. Antes da v1.15 essa aba era ignorada e a seção
    // se perdia na importação — e, por consequência, na exportação.
    const mapaSecoes = {};
    await commitEmLotes(
      secoes.filter((linha) => linha.sq_secao !== "" && linha.nm_secao !== "").map((linha) => (lote) => {
        const id = `legado_secao_${linha.sq_secao}`;
        const nome = String(linha.nm_secao);
        mapaSecoes[linha.sq_secao] = { id, nome };
        lote.set(colecaoEntidade("secoes").doc(id), { nome, nomeNormalizado: normalizarTexto(nome), sqLegado: String(linha.sq_secao) }, { merge: true });
      })
    );

    // -------- 3. TIPOS DE IMÓVEL --------
    barra.atualizarPercentual(15, "Importando tipos de imóvel");
    const mapaTiposImovel = {};
    await commitEmLotes(
      tiposImovel.map((linha) => (lote) => {
        const id = `legado_tipoimovel_${linha.sq_tipoImovel}`;
        mapaTiposImovel[linha.sq_tipoImovel] = { id, nome: linha.nm_tipoImovel };
        lote.set(colecaoEntidade("tiposImovel").doc(id), { nome: linha.nm_tipoImovel, nomeNormalizado: normalizarTexto(linha.nm_tipoImovel), sqLegado: String(linha.sq_tipoImovel) }, { merge: true });
      })
    );

    // -------- 4. BAIRROS (vinculado a Zona) --------
    barra.atualizarPercentual(20, "Importando bairros");
    const mapaBairros = {};
    await commitEmLotes(
      bairros.map((linha) => (lote) => {
        const id = `legado_bairro_${linha.sq_bairro}`;
        const zona = mapaZonas[linha.sq_zona];
        mapaBairros[linha.sq_bairro] = { id, nome: linha.nm_bairro };
        lote.set(
          colecaoEntidade("bairros").doc(id),
          { nome: linha.nm_bairro, nomeNormalizado: normalizarTexto(linha.nm_bairro), zonaId: zona?.id || null, zonaNome: zona?.nome || "", sqLegado: String(linha.sq_bairro) },
          { merge: true }
        );
      })
    );

    // -------- 5. SETORES (vinculado a Distrito) --------
    // Código do setor: usa nu_setor quando presente; senão tenta
    // extrair o número embutido no nome (ex: "SETOR 04" → "04"); senão
    // cai numa sequência própria.
    barra.atualizarPercentual(28, "Importando setores");
    const mapaSetores = {};
    await commitEmLotes(
      setoresMunicipio.map((linha, indice) => (lote) => {
        const id = `legado_setor_${linha.sq_setor}`;
        const distrito = mapaDistritos[linha.sq_distrito];
        const codigo = linha.nu_setor ? preencherZeros(linha.nu_setor, 2) : extrairCodigoNumerico(linha.nm_setor, 2, indice + 1);
        mapaSetores[linha.sq_setor] = { id, nome: linha.nm_setor, codigo, distritoId: distrito?.id, distritoNome: distrito?.nome, distritoCodigo: distrito?.codigo };
        lote.set(
          colecaoEntidade("setores").doc(id),
          {
            nome: linha.nm_setor, nomeNormalizado: normalizarTexto(linha.nm_setor), codigo,
            distritoId: distrito?.id || null, distritoNome: distrito?.nome || "", distritoCodigo: distrito?.codigo || "",
            sqLegado: String(linha.sq_setor),
          },
          { merge: true }
        );
      })
    );

    // Vínculo Quadra → Setor vem de uma tabela à parte (SETOR_QUADRA)
    const mapaSetorPorQuadra = {};
    setorQuadra.forEach((linha) => {
      if (!linha.dt_desativacao) mapaSetorPorQuadra[linha.sq_quadra] = linha.sq_setor;
    });

    // -------- 6. QUADRAS (vinculado a Setor, via SETOR_QUADRA) --------
    // Código da quadra: usa nu_quadra quando presente; senão extrai do
    // nome; senão sequência própria.
    barra.atualizarPercentual(36, "Importando quadras");
    const mapaQuadras = {};
    let quadrasSemSetor = 0;
    await commitEmLotes(
      quadras.map((linha, indice) => (lote) => {
        const id = `legado_quadra_${linha.sq_quadra}`;
        const sqSetor = mapaSetorPorQuadra[linha.sq_quadra];
        const setor = mapaSetores[sqSetor];
        if (!setor) quadrasSemSetor++;
        const codigo = linha.nu_quadra ? preencherZeros(linha.nu_quadra, 3) : extrairCodigoNumerico(linha.nm_quadra, 3, indice + 1);
        mapaQuadras[linha.sq_quadra] = { id, nome: linha.nm_quadra, codigo, setorCodigo: setor?.codigo, distritoCodigo: setor?.distritoCodigo };
        lote.set(
          colecaoEntidade("quadras").doc(id),
          {
            nome: linha.nm_quadra, nomeNormalizado: normalizarTexto(linha.nm_quadra), codigo,
            setorId: setor?.id || null, setorNome: setor?.nome || "", setorCodigo: setor?.codigo || "",
            distritoId: setor?.distritoId || null, distritoNome: setor?.distritoNome || "", distritoCodigo: setor?.distritoCodigo || "",
            sqLegado: String(linha.sq_quadra),
          },
          { merge: true }
        );
      })
    );
    if (quadrasSemSetor > 0) logImportacao(`⚠️ ${quadrasSemSetor} quadra(s) sem setor vinculado na planilha original.`);

    // Vínculo Logradouro → Bairro + CEP vem de BAIRRO_LOGRADOURO
    const mapaBairroPorLogradouro = {};
    bairroLogradouro.forEach((linha) => {
      mapaBairroPorLogradouro[linha.sq_logradouro] = { sqBairro: linha.sq_bairro, cep: linha.nu_cep };
    });

    // -------- 7. LOGRADOUROS --------
    barra.atualizarPercentual(45, "Importando logradouros");
    const mapaLogradouros = {};
    await commitEmLotes(
      logradouros.map((linha) => (lote) => {
        const id = `legado_logradouro_${linha.sq_logradouro}`;
        const vinculo = mapaBairroPorLogradouro[linha.sq_logradouro];
        const bairro = vinculo ? mapaBairros[vinculo.sqBairro] : null;
        mapaLogradouros[linha.sq_logradouro] = { id, nome: linha.nm_logradouro };
        lote.set(
          colecaoEntidade("logradouros").doc(id),
          {
            nome: linha.nm_logradouro, nomeNormalizado: normalizarTexto(linha.nm_logradouro),
            tipo: linha.tp_logradouro || "",
            bairroId: bairro?.id || null, bairroNome: bairro?.nome || "",
            cep: vinculo?.cep ? String(vinculo.cep) : "",
            codigoLegado: String(linha.sq_logradouro),
          },
          { merge: true }
        );
      })
    );

    // -------- 8. CONTRIBUINTES --------
    barra.atualizarPercentual(55, "Importando contribuintes");
    const mapaContribuintes = {};
    await commitEmLotes(
      contribuintes.map((linha) => (lote) => {
        const id = `legado_contribuinte_${linha.sq_contribuinte}`;
        mapaContribuintes[linha.sq_contribuinte] = {
          id, nome: linha.nm_contribuinte, cpfCnpj: String(linha.nu_cpfCnpjContribuinte || ""),
          telefone: String(linha.nu_telefone || ""), celular: String(linha.nu_celular || ""), email: linha.ds_email || "",
        };
        lote.set(
          colecaoEntidade("contribuintes").doc(id),
          {
            nome: linha.nm_contribuinte, nomeNormalizado: normalizarTexto(linha.nm_contribuinte),
            cpfCnpj: String(linha.nu_cpfCnpjContribuinte || ""), cpfCnpjNormalizado: apenasDigitos(linha.nu_cpfCnpjContribuinte),
            telefone: String(linha.nu_telefone || ""), celular: String(linha.nu_celular || ""), email: linha.ds_email || "",
            endereco: linha.ds_logradouro || "", bairro: linha.ds_bairro || "", cep: String(linha.nu_cep || ""),
            codigoLegado: String(linha.sq_contribuinte),
          },
          { merge: true }
        );
      })
    );

    // -------- 9. ÁREAS DOS IMÓVEIS (indexadas por sq_imovel) --------
    const mapaAreas = {};
    areasImovel.forEach((linha) => {
      if (!mapaAreas[linha.sq_imovel]) mapaAreas[linha.sq_imovel] = linha; // usa o primeiro registro de área encontrado
    });

    // -------- 10. BOLETINS (a partir de IMOVEL + AREA_IMOVEL) --------
    barra.atualizarPercentual(65, "Importando boletins (imóveis)");
    let imoveisSemLogradouro = 0;
    let imoveisSemQuadra = 0;
    const operacoesImoveis = imoveis.map((linha) => (lote) => {
      const id = `legado_imovel_${linha.sq_imovel}`;
      const logradouro = mapaLogradouros[linha.sq_logradouro];
      const quadra = mapaQuadras[linha.sq_quadra];
      const bairro = mapaBairros[linha.sq_bairro];
      const tipoImovel = mapaTiposImovel[linha.sq_tipoImovel];
      const secao = linha.sq_secao ? mapaSecoes[linha.sq_secao] : null;
      const proprietario = mapaContribuintes[linha.sq_contribuinte];
      const responsavel = linha.sq_contribuinteResponsavel ? mapaContribuintes[linha.sq_contribuinteResponsavel] : null;
      const area = mapaAreas[linha.sq_imovel];

      if (!logradouro) imoveisSemLogradouro++;
      if (!quadra) imoveisSemQuadra++;

      const dados = {
        inscricaoImobiliaria: String(linha.nu_publico || ""),
        inscricaoImobiliariaAnterior: String(linha.nu_publicoAnterior || ""),
        statusAtualizacao: "pendente",

        logradouroId: logradouro?.id || null, logradouroNome: logradouro?.nome || "",
        numero: String(linha.nu_logradouro || ""),
        complemento: linha.ds_complemento || "",
        bairroId: bairro?.id || null, bairroNome: bairro?.nome || "",
        quadraId: quadra?.id || null, quadraNome: quadra?.nome || "", quadraCodigo: quadra?.codigo || "",
        setorId: mapaSetorPorQuadra[linha.sq_quadra] ? mapaSetores[mapaSetorPorQuadra[linha.sq_quadra]]?.id : null,
        setorNome: mapaSetorPorQuadra[linha.sq_quadra] ? mapaSetores[mapaSetorPorQuadra[linha.sq_quadra]]?.nome : "",
        setorCodigo: mapaSetorPorQuadra[linha.sq_quadra] ? mapaSetores[mapaSetorPorQuadra[linha.sq_quadra]]?.codigo : "",
        // distritoId gravado direto (além do distritoCodigo) pra ficar
        // consistente com o salvamento manual do boletim e permitir
        // resolver o distrito sem precisar reconsultar o setor —
        // usado pela Exportação de Alterações.
        distritoId: mapaSetorPorQuadra[linha.sq_quadra] ? mapaSetores[mapaSetorPorQuadra[linha.sq_quadra]]?.distritoId : null,
        distritoCodigo: mapaSetorPorQuadra[linha.sq_quadra] ? mapaSetores[mapaSetorPorQuadra[linha.sq_quadra]]?.distritoCodigo : "",
        lote: String(linha.nu_lote || ""),
        unidade: String(linha.nu_unidade || ""),
        tipoImovelId: tipoImovel?.id || null, tipoImovelNome: tipoImovel?.nome || "",
        secaoId: secao?.id || null, secaoNome: secao?.nome || "",
        medidorAgua: String(linha.nu_medidorAgua || ""),
        medidorEnergia: String(linha.nu_medidorEnergia || ""),

        proprietarioContribuinteId: proprietario?.id || null,
        proprietarioNome: proprietario?.nome || "",
        proprietarioNomeNormalizado: normalizarTexto(proprietario?.nome || ""),
        proprietarioCpfCnpj: proprietario?.cpfCnpj || "",
        proprietarioTelefone: proprietario?.telefone || "",
        proprietarioCelular: proprietario?.celular || "",
        proprietarioEmail: proprietario?.email || "",

        mesmoResponsavelProprietario: !responsavel,
        responsavelContribuinteId: responsavel?.id || null,
        responsavelNome: responsavel?.nome || proprietario?.nome || "",
        responsavelCpfCnpj: responsavel?.cpfCnpj || proprietario?.cpfCnpj || "",

        corrEndereco: linha.ds_logradouroCorrespondencia || "",
        corrNumero: String(linha.nu_logradouroCorrespondencia || ""),
        corrBairro: linha.ds_bairroCorrespondencia || "",
        corrCep: String(linha.nu_cepCorrespondencia || ""),
        corrComplemento: linha.ds_complementoCorrespondencia || "",

        observacao: linha.ds_observacao || "",
        dimNumeroPavimentos: linha.nu_pavimentos ? parseNumeroBR(linha.nu_pavimentos) : null,
        latitude: linha.nu_latitude ? String(linha.nu_latitude) : null,
        longitude: linha.nu_longitude ? String(linha.nu_longitude) : null,

        dataCadastro: parseDataLegado(linha.dt_cadastro) || dataLocalISO(),
        dataAtualizacao: parseDataLegado(linha.dt_alteracao) || dataLocalISO(),
        usuarioAtualizacaoNome: "Importação do legado",
        origemLegadoId: String(linha.sq_imovel),
      };

      if (area) {
        dados.areaTerrenoFrente = parseNumeroBR(area.vl_frenteTerreno);
        dados.areaTerrenoFundo = parseNumeroBR(area.vl_fundoTerreno);
        dados.areaTerrenoLadoDireito = parseNumeroBR(area.vl_ladoDireitoTerreno);
        dados.areaTerrenoLadoEsquerdo = parseNumeroBR(area.vl_ladoEsquerdoTerreno);
        dados.areaTerrenoTotal = parseNumeroBR(area.vl_totalTerreno);
        dados.areaConstruidaFrente = parseNumeroBR(area.vl_frenteConstrucao);
        dados.areaConstruidaFundo = parseNumeroBR(area.vl_fundoConstrucao);
        dados.areaConstruidaLadoDireito = parseNumeroBR(area.vl_ladoDireitoConstrucao);
        dados.areaConstruidaLadoEsquerdo = parseNumeroBR(area.vl_ladoEsquerdoConstrucao);
        dados.areaConstruidaTotal = parseNumeroBR(area.vl_totalConstruido);
      }

      // Campos de código fixo do BCI (natureza, edificação, etc.) não
      // existem na base legada — ficam em branco, é justamente o que a
      // campanha de atualização em campo vai preencher.

      lote.set(colecaoEntidade("boletins").doc(id), dados, { merge: true });
    });
    await commitEmLotes(operacoesImoveis);

    barra.atualizarPercentual(100, "Concluído");
    logImportacao(`✅ Importação concluída: ${zonas.length} zonas, ${distritos.length} distritos, ${tiposImovel.length} tipos de imóvel, ${secoes.length} seções, ${bairros.length} bairros, ${setoresMunicipio.length} setores, ${quadras.length} quadras, ${logradouros.length} logradouros, ${contribuintes.length} contribuintes, ${imoveis.length} boletins.`);
    if (imoveisSemLogradouro > 0) logImportacao(`⚠️ ${imoveisSemLogradouro} imóvel(is) importado(s) sem logradouro vinculado — confira e complete manualmente no boletim.`);
    if (imoveisSemQuadra > 0) logImportacao(`⚠️ ${imoveisSemQuadra} imóvel(is) importado(s) sem quadra vinculada — confira e complete manualmente no boletim.`);
    mostrarToast("Importação do legado concluída com sucesso.", "sucesso");
  } catch (erro) {
    console.error(erro);
    logImportacao(`❌ Erro durante a importação: ${erro.message}`);
    mostrarToast("Erro durante a importação. Veja o log na tela para detalhes.", "erro");
  } finally {
    barra.remover();
  }
}
