// ===================================================================
// BOLETIM DE CADASTRO IMOBILIÁRIO (BCI) — módulo principal do app
// ===================================================================

// Grupos de campos de código fixo, reaproveitando as listas de
// codigos-bci.js — evita repetir a mesma estrutura de <select> ~20 vezes.
const CAMPOS_CODIGO = {
  natureza: "Natureza",
  edificacao: "Edificação",
  estrutura: "Estrutura",
  patrimonio: "Patrimônio",
  utilizacao: "Utilização",
  limitacao: "Limitação",
  isencaoIptu: "Isenção de IPTU",
  isencaoTsu: "Isenção de TSU",
  situacao: "Situação",
  topografia: "Topografia",
  pedologia: "Pedologia",
  posicionamento: "Posicionamento",
  cobertura: "Cobertura",
  forro: "Forro",
  paredes: "Paredes",
  fachada: "Fachada",
  instalacaoSanitaria: "Instalação Sanitária",
  instalacaoEletrica: "Instalação Elétrica",
  piso: "Piso",
  conservacao: "Conservação",
};

const GRUPOS_CODIGO = [
  { titulo: "Caracterização do Imóvel", campos: ["natureza", "edificacao"] },
  { titulo: "Informação sobre a Edificação", campos: ["estrutura", "patrimonio", "utilizacao", "limitacao", "isencaoIptu", "isencaoTsu"] },
  { titulo: "Informações Gerais sobre o Terreno", campos: ["situacao", "topografia", "pedologia", "posicionamento"] },
  { titulo: "Fatores de Qualidade do Imóvel", campos: ["cobertura", "forro", "paredes", "fachada", "instalacaoSanitaria", "instalacaoEletrica", "piso", "conservacao"] },
];

function campoSelectCodigo(chave, valorAtual) {
  return `
    <div>
      <label>${CAMPOS_CODIGO[chave]}</label>
      <select id="campo-${chave}">${montarOpcoesCodigo(CODIGOS_BCI[chave], valorAtual)}</select>
    </div>
  `;
}

function criarSecaoFormulario(titulo, conteudoHtml, abertaPorPadrao = false) {
  return `
    <details class="secao-formulario" ${abertaPorPadrao ? "open" : ""}>
      <summary>${titulo}</summary>
      <div class="conteudo-secao-formulario">${conteudoHtml}</div>
    </details>
  `;
}

// -------------------------------------------------------------
// LISTA DE BOLETINS
// -------------------------------------------------------------
async function renderizarBoletins(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Boletins de Cadastro Imobiliário</h2>
      ${usuarioPodeEditar() ? `<button class="botao-primario" id="btn-novo">+ Novo Boletim</button>` : ""}
    </div>
    <div class="barra-busca">
      <input type="text" id="campo-busca" placeholder="Buscar por inscrição imobiliária ou nome do proprietário...">
      <select id="filtro-status" class="filtro-ano">
        <option value="">Todos os status</option>
        <option value="pendente">Pendente de atualização</option>
        <option value="atualizado">Atualizado</option>
      </select>
    </div>
    <div id="lista-registros" class="lista-cartoes"></div>
    <button id="btn-carregar-mais" class="botao-secundario oculto">Carregar mais</button>
  `;

  let paginador = criarPaginador(colecaoEntidade("boletins").orderBy("inscricaoImobiliaria"));

  function badgeStatus(status) {
    if (status === "atualizado") return `<span class="etiqueta-status etiqueta-sucesso">Atualizado</span>`;
    return `<span class="etiqueta-status etiqueta-atencao">Pendente</span>`;
  }

  function criarCartao(registro) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro cartao-clicavel";
    const endereco = [registro.logradouroTipo, registro.logradouroNome, registro.numero].filter(Boolean).join(" ");
    cartao.innerHTML = `
      <div>
        <strong>${escaparHtml(registro.inscricaoImobiliaria || "(sem inscrição)")}</strong> ${badgeStatus(registro.statusAtualizacao)}
        <div class="texto-secundario">${escaparHtml(endereco || "Endereço não informado")}${registro.bairroNome ? " — " + escaparHtml(registro.bairroNome) : ""}</div>
        <div class="texto-secundario">${escaparHtml(registro.proprietarioNome || "Proprietário não informado")}</div>
      </div>
    `;
    cartao.addEventListener("click", () => abrirEditorBoletim(area, registro));
    return cartao;
  }

  async function carregarPagina(limpar = false) {
    const lista = document.getElementById("lista-registros");
    if (limpar) lista.innerHTML = "";
    try {
      const registros = await paginador.carregarProximaPagina();
      registros.forEach((registro) => lista.appendChild(criarCartao(registro)));
      document.getElementById("btn-carregar-mais").classList.toggle("oculto", !paginador.temMais);
      if (limpar && registros.length === 0) lista.innerHTML = `<p class="texto-secundario">Nenhum boletim cadastrado ainda.</p>`;
    } catch (erro) {
      tratarErroConsultaFirestore(erro);
      document.getElementById("btn-carregar-mais").classList.add("oculto");
    }
  }

  document.getElementById("btn-carregar-mais").addEventListener("click", () => carregarPagina(false));
  document.getElementById("btn-novo")?.addEventListener("click", () => abrirEditorBoletim(area, null));

  document.getElementById("filtro-status").addEventListener("change", (evento) => {
    const status = evento.target.value;
    paginador = criarPaginador(
      status
        ? colecaoEntidade("boletins").where("statusAtualizacao", "==", status).orderBy("inscricaoImobiliaria")
        : colecaoEntidade("boletins").orderBy("inscricaoImobiliaria")
    );
    carregarPagina(true);
  });

  let temporizadorBusca;
  document.getElementById("campo-busca").addEventListener("input", (evento) => {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(async () => {
      const termoOriginal = evento.target.value.trim();
      const lista = document.getElementById("lista-registros");
      lista.innerHTML = "";
      if (!termoOriginal) { paginador.reiniciar(); carregarPagina(true); return; }
      try {
        const ehNumerico = /^[0-9.\-\/\s]+$/.test(termoOriginal);
        let snapshot;
        if (ehNumerico) {
          snapshot = await colecaoEntidade("boletins").orderBy("inscricaoImobiliaria").startAt(termoOriginal).endAt(termoOriginal + "\uf8ff").limit(TAMANHO_PAGINA).get();
        } else {
          const termo = normalizarTexto(termoOriginal);
          snapshot = await colecaoEntidade("boletins").orderBy("proprietarioNomeNormalizado").startAt(termo).endAt(termo + "\uf8ff").limit(TAMANHO_PAGINA).get();
        }
        snapshot.docs.forEach((doc) => lista.appendChild(criarCartao({ id: doc.id, ...doc.data() })));
        if (snapshot.empty) lista.innerHTML = `<p class="texto-secundario">Nenhum resultado encontrado.</p>`;
        document.getElementById("btn-carregar-mais").classList.add("oculto");
      } catch (erro) {
        tratarErroConsultaFirestore(erro);
      }
    }, 300);
  });

  carregarPagina(true);
}

// -------------------------------------------------------------
// EDITOR DO BOLETIM (página cheia — o formulário é grande demais pra um modal)
// -------------------------------------------------------------
async function abrirEditorBoletim(area, registro) {
  const podeEditar = usuarioPodeEditar();

  area.innerHTML = `<p class="texto-secundario">Carregando cadastros de apoio...</p>`;

  const [logradouros, quadras, condominios, tiposImovel] = await Promise.all([
    carregarListaCompleta("logradouros"),
    carregarListaCompleta("quadras"),
    carregarListaCompleta("condominios"),
    carregarListaCompleta("tiposImovel"),
  ]);

  let coProprietarios = [];
  if (registro?.id) {
    const snapshotCo = await colecaoEntidade("boletins").doc(registro.id).collection("coProprietarios").get();
    coProprietarios = snapshotCo.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const r = registro || {};

  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>${registro ? "Editar" : "Novo"} Boletim ${registro?.inscricaoImobiliaria ? "— " + escaparHtml(registro.inscricaoImobiliaria) : ""}</h2>
      <button class="botao-secundario" id="btn-voltar-lista">← Voltar à lista</button>
    </div>

    ${criarSecaoFormulario("01/02 — Inscrição Imobiliária", `
      <label>Inscrição Imobiliária Atual *</label>
      <div class="linha-com-botao">
        <input type="text" id="campo-inscricao" value="${r.inscricaoImobiliaria || ""}" placeholder="00.00.000.0000.000">
        <button type="button" class="botao-secundario" id="btn-gerar-inscricao">🔄 Gerar</button>
      </div>
      <p class="texto-secundario">Padrão: Distrito(2) . Setor(2) . Quadra(3) . Lote(4) . Unidade(3). O botão "Gerar" monta esse número a partir da Quadra, Lote e Unidade escolhidos abaixo — mas você também pode digitar manualmente.</p>
      <label>Inscrição Imobiliária Anterior</label>
      <input type="text" id="campo-inscricao-anterior" value="${r.inscricaoImobiliariaAnterior || ""}">
      <label>Status desta atualização</label>
      <select id="campo-status">
        <option value="pendente" ${r.statusAtualizacao !== "atualizado" ? "selected" : ""}>Pendente de atualização</option>
        <option value="atualizado" ${r.statusAtualizacao === "atualizado" ? "selected" : ""}>Atualizado / confirmado em campo</option>
      </select>
    `, true)}

    ${criarSecaoFormulario("03 — Localização do Imóvel", `
      <label>Logradouro *</label>
      ${htmlComboBusca("campo-logradouro", r.logradouroId ? `${r.logradouroTipo ? r.logradouroTipo + " " : ""}${r.logradouroNome}` : "", "Buscar logradouro...")}
      <div class="linha-formulario">
        <div><label>Número</label><input type="text" id="campo-numero" value="${r.numero || ""}"></div>
        <div><label>Complemento</label><input type="text" id="campo-complemento" value="${r.complemento || ""}"></div>
      </div>
      <div class="linha-formulario">
        <div><label>Bairro <span class="texto-secundario">(automático)</span></label><input type="text" id="campo-bairro-auto" value="${r.bairroNome || ""}" readonly></div>
        <div><label>CEP <span class="texto-secundario">(automático)</span></label><input type="text" id="campo-cep-auto" value="${r.cep || ""}" readonly></div>
      </div>
      <label>Quadra *</label>
      ${htmlComboBusca("campo-quadra", r.quadraId ? `Quadra ${r.quadraNome} — Setor ${r.setorNome} / ${r.distritoNome}` : "", "Buscar quadra...")}
      <div class="linha-formulario">
        <div><label>Setor <span class="texto-secundario">(automático)</span></label><input type="text" id="campo-setor-auto" value="${r.setorNome || ""}" readonly></div>
        <div><label>Distrito <span class="texto-secundario">(automático)</span></label><input type="text" id="campo-distrito-auto" value="${r.distritoNome || ""}" readonly></div>
      </div>
      <div class="linha-formulario">
        <div><label>Lote (até 4 dígitos)</label><input type="text" id="campo-lote" inputmode="numeric" maxlength="4" value="${r.lote || ""}"></div>
        <div><label>Unidade (até 3 dígitos)</label><input type="text" id="campo-unidade" inputmode="numeric" maxlength="3" value="${r.unidade || ""}"></div>
      </div>
      <label>Condomínio</label>
      ${htmlComboBusca("campo-condominio", condominios.find((c) => c.id === r.condominioId)?.nome, "Buscar condomínio (opcional)...")}
      <label>Tipo de Imóvel *</label>
      ${htmlComboBusca("campo-tipo-imovel", tiposImovel.find((t) => t.id === r.tipoImovelId)?.nome, "Buscar tipo de imóvel...")}
      <div class="linha-formulario">
        <div><label>Nº Medidor Água</label><input type="text" id="campo-medidor-agua" value="${r.medidorAgua || ""}"></div>
        <div><label>Nº Medidor Energia</label><input type="text" id="campo-medidor-energia" value="${r.medidorEnergia || ""}"></div>
      </div>
    `, true)}

    ${criarSecaoFormulario(GRUPOS_CODIGO[0].titulo, GRUPOS_CODIGO[0].campos.map((c) => campoSelectCodigo(c, r[c])).join(""), true)}

    ${criarSecaoFormulario("04 — Dados do Proprietário", `
      <label>CPF/CNPJ *</label>
      <div class="linha-com-botao">
        <input type="text" id="campo-proprietario-cpfcnpj" value="${r.proprietarioCpfCnpj || ""}" placeholder="Digite e saia do campo para buscar">
        <button type="button" class="botao-secundario" id="btn-buscar-proprietario">🔎 Buscar</button>
      </div>
      <p class="texto-secundario" id="aviso-busca-proprietario"></p>
      <label>Nome *</label>
      <input type="text" id="campo-proprietario-nome" value="${r.proprietarioNome ? escaparHtml(r.proprietarioNome) : ""}">
      <div class="linha-formulario">
        <div><label>Telefone</label><input type="text" id="campo-proprietario-telefone" value="${r.proprietarioTelefone || ""}"></div>
        <div><label>Celular</label><input type="text" id="campo-proprietario-celular" value="${r.proprietarioCelular || ""}"></div>
      </div>
      <label>E-mail</label>
      <input type="email" id="campo-proprietario-email" value="${r.proprietarioEmail || ""}">
    `, true)}

    ${criarSecaoFormulario("05 — Dados do Responsável pelo Pagamento", `
      <label class="item-checkbox"><input type="checkbox" id="campo-mesmo-responsavel" ${r.mesmoResponsavelProprietario !== false ? "checked" : ""}> Mesmo que o proprietário</label>
      <div id="bloco-responsavel" class="${r.mesmoResponsavelProprietario !== false ? "oculto" : ""}">
        <label>CPF/CNPJ</label>
        <div class="linha-com-botao">
          <input type="text" id="campo-responsavel-cpfcnpj" value="${r.responsavelCpfCnpj || ""}">
          <button type="button" class="botao-secundario" id="btn-buscar-responsavel">🔎 Buscar</button>
        </div>
        <p class="texto-secundario" id="aviso-busca-responsavel"></p>
        <label>Nome</label>
        <input type="text" id="campo-responsavel-nome" value="${r.responsavelNome ? escaparHtml(r.responsavelNome) : ""}">
        <div class="linha-formulario">
          <div><label>Telefone</label><input type="text" id="campo-responsavel-telefone" value="${r.responsavelTelefone || ""}"></div>
          <div><label>Celular</label><input type="text" id="campo-responsavel-celular" value="${r.responsavelCelular || ""}"></div>
        </div>
        <label>E-mail</label>
        <input type="email" id="campo-responsavel-email" value="${r.responsavelEmail || ""}">
      </div>
    `)}

    ${criarSecaoFormulario("06 — Endereço para Correspondência", `
      <label class="item-checkbox"><input type="checkbox" id="campo-corr-mesmo-proprietario" ${r.corrMesmoProprietario ? "checked" : ""}> Mesmo endereço cadastrado do proprietário</label>
      <p class="texto-secundario" id="aviso-corr-mesmo-proprietario"></p>
      <div id="bloco-corr-endereco" class="${r.corrMesmoProprietario ? "oculto" : ""}">
        <div class="linha-formulario">
          <div><label>Endereço</label><input type="text" id="campo-corr-endereco" value="${r.corrEndereco || ""}"></div>
          <div><label>Número</label><input type="text" id="campo-corr-numero" value="${r.corrNumero || ""}"></div>
        </div>
        <div class="linha-formulario">
          <div><label>Bairro</label><input type="text" id="campo-corr-bairro" value="${r.corrBairro || ""}"></div>
          <div><label>CEP</label><input type="text" id="campo-corr-cep" value="${r.corrCep || ""}"></div>
        </div>
        <div class="linha-formulario">
          <div><label>Complemento</label><input type="text" id="campo-corr-complemento" value="${r.corrComplemento || ""}"></div>
          <div><label>País</label><input type="text" id="campo-corr-pais" value="${r.corrPais || "Brasil"}"></div>
        </div>
        <div class="linha-formulario">
          <div><label>Município</label><input type="text" id="campo-corr-municipio" value="${r.corrMunicipio || ""}"></div>
          <div><label>UF</label><input type="text" id="campo-corr-uf" value="${r.corrUf || "RN"}" maxlength="2"></div>
        </div>
      </div>
    `)}

    ${criarSecaoFormulario("10 — Medidas do Imóvel", `
      <h4>Área do Terreno</h4>
      ${blocoMedidas("terreno", r)}
      <h4 style="margin-top:14px">Área Construída</h4>
      ${blocoMedidas("construida", r)}
    `)}

    ${criarSecaoFormulario("11 — Demais Proprietários", `
      <div id="lista-coproprietarios"></div>
      <button type="button" class="botao-secundario" id="btn-add-coproprietario">+ Adicionar co-proprietário</button>
    `)}

    ${criarSecaoFormulario("12 — Observação", `
      <textarea id="campo-observacao" rows="3">${r.observacao ? escaparHtml(r.observacao) : ""}</textarea>
    `)}

    ${GRUPOS_CODIGO.slice(1).map((g) => criarSecaoFormulario(g.titulo, g.campos.map((c) => campoSelectCodigo(c, r[c])).join(""))).join("")}

    ${criarSecaoFormulario("Ano de Aquisição e Dimensões da Unidade (Croquis)", `
      <label>Ano de Aquisição</label>
      <input type="number" id="campo-ano-aquisicao" value="${r.anoAquisicao || ""}" style="max-width:160px">
      <div class="linha-formulario" style="margin-top:10px">
        <div><label>Área do Terreno (m²)</label><input type="number" step="0.01" id="campo-dim-area-terreno" value="${r.dimAreaTerreno || ""}"></div>
        <div><label>Testada em T1</label><input type="number" step="0.01" id="campo-dim-t1" value="${r.dimTestadaT1 || ""}"></div>
      </div>
      <div class="linha-formulario">
        <div><label>Área da Unidade (m²)</label><input type="number" step="0.01" id="campo-dim-area-unidade" value="${r.dimAreaUnidade || ""}"></div>
        <div><label>Testada em T2</label><input type="number" step="0.01" id="campo-dim-t2" value="${r.dimTestadaT2 || ""}"></div>
      </div>
      <div class="linha-formulario">
        <div><label>Área Total da Edificação (m²)</label><input type="number" step="0.01" id="campo-dim-area-total-edificacao" value="${r.dimAreaTotalEdificacao || ""}"></div>
        <div><label>Testada em T3</label><input type="number" step="0.01" id="campo-dim-t3" value="${r.dimTestadaT3 || ""}"></div>
      </div>
      <div class="linha-formulario">
        <div><label>Número de Pavimentos</label><input type="number" id="campo-dim-pavimentos" value="${r.dimNumeroPavimentos || ""}"></div>
        <div><label>Testada em T4</label><input type="number" step="0.01" id="campo-dim-t4" value="${r.dimTestadaT4 || ""}"></div>
      </div>
    `)}

    ${criarSecaoFormulario("Localização em Campo (GPS)", `
      <div class="linha-formulario">
        <div><label>Latitude</label><input type="text" id="campo-latitude" value="${r.latitude || ""}" readonly></div>
        <div><label>Longitude</label><input type="text" id="campo-longitude" value="${r.longitude || ""}" readonly></div>
      </div>
      <button type="button" class="botao-secundario" id="btn-capturar-gps">📍 Usar minha localização atual</button>
      <p class="texto-secundario">Use este botão estando fisicamente no imóvel, durante a vistoria em campo.</p>
    `)}

    ${criarSecaoFormulario("Croquis da Unidade (desenho)", `
      <div id="area-croqui">
        ${registro?.id
          ? `<div class="quadro-croqui"><canvas id="canvas-croqui"></canvas></div>
             <div class="ferramentas-croqui">
               <input type="color" id="croqui-cor" value="#0f2947" title="Cor do traço">
               <input type="range" id="croqui-espessura" min="1" max="10" value="3" title="Espessura do traço">
               <button type="button" class="botao-secundario" id="btn-croqui-limpar">🧹 Limpar</button>
               ${podeEditar ? `<button type="button" class="botao-primario" id="btn-croqui-salvar">💾 Salvar Croqui</button>` : ""}
               <span class="texto-secundario" id="status-croqui"></span>
             </div>
             <p class="texto-secundario">Desenhe com o dedo (celular/tablet) ou o mouse — o quadriculado é só um guia, como no boletim em papel.</p>`
          : `<p class="texto-secundario">Salve o boletim primeiro para poder desenhar o croqui.</p>`}
      </div>
    `)}

    ${criarSecaoFormulario("Fotos do Imóvel", `
      <div id="area-fotos">
        ${registro?.id ? `<div id="grade-fotos" class="grade-fotos"></div><input type="file" id="campo-fotos" accept="image/*" capture="environment" multiple ${podeEditar ? "" : "disabled"}>` : `<p class="texto-secundario">Salve o boletim primeiro para poder anexar fotos.</p>`}
      </div>
    `)}

    <div class="rodape-formulario-pagina">
      ${podeEditar ? `<button class="botao-primario" id="btn-salvar-boletim">Salvar Boletim</button>` : ""}
      ${registro?.id ? `<button class="botao-secundario" id="btn-exportar-pdf">🖨️ Exportar PDF</button>` : ""}
      ${registro?.id && usuarioEhAdministrador() ? `<button class="botao-perigo" id="btn-excluir-boletim">🗑️ Excluir Boletim</button>` : ""}
    </div>
  `;

  if (!podeEditar) {
    area.querySelectorAll("input, select, textarea").forEach((campo) => { campo.disabled = true; });
  }

  document.getElementById("btn-voltar-lista").addEventListener("click", () => renderizarBoletins(area));

  // -------- Combos com busca: Logradouro, Quadra, Condomínio, Tipo de Imóvel --------
  ativarComboBusca(
    "campo-logradouro",
    logradouros.map((l) => ({ id: l.id, nome: `${l.tipo ? l.tipo + " " : ""}${l.nome}` })),
    r.logradouroId,
    (opcao) => {
      const logradouro = opcao ? logradouros.find((l) => l.id === opcao.id) : null;
      document.getElementById("campo-bairro-auto").value = logradouro?.bairroNome || "";
      document.getElementById("campo-cep-auto").value = logradouro?.cep || "";
    }
  );

  ativarComboBusca(
    "campo-quadra",
    quadras.map((q) => ({ id: q.id, nome: `Quadra ${q.nome} — Setor ${q.setorNome} / ${q.distritoNome}` })),
    r.quadraId,
    (opcao) => {
      const quadra = opcao ? quadras.find((q) => q.id === opcao.id) : null;
      document.getElementById("campo-setor-auto").value = quadra?.setorNome || "";
      document.getElementById("campo-distrito-auto").value = quadra?.distritoNome || "";
    }
  );

  ativarComboBusca("campo-condominio", condominios, r.condominioId, () => {});
  ativarComboBusca("campo-tipo-imovel", tiposImovel, r.tipoImovelId, () => {});

  // -------- Gerar inscrição imobiliária automaticamente --------
  // Padrão: Distrito(2) . Setor(2) . Quadra(3) . Lote(4) . Unidade(3)
  document.getElementById("btn-gerar-inscricao").addEventListener("click", () => {
    const quadraId = document.getElementById("campo-quadra-valor").value;
    const quadra = quadras.find((q) => q.id === quadraId);
    if (!quadra) { mostrarToast("Selecione a Quadra antes de gerar a inscrição.", "erro"); return; }
    if (!quadra.codigo || !quadra.setorCodigo || !quadra.distritoCodigo) {
      mostrarToast("A Quadra, o Setor ou o Distrito selecionados ainda não têm código cadastrado — complete o código neles primeiro.", "erro");
      return;
    }
    const lote = document.getElementById("campo-lote").value;
    const unidade = document.getElementById("campo-unidade").value;
    if (!lote) { mostrarToast("Informe o Lote antes de gerar a inscrição.", "erro"); return; }
    const inscricao = [
      preencherZeros(quadra.distritoCodigo, 2),
      preencherZeros(quadra.setorCodigo, 2),
      preencherZeros(quadra.codigo, 3),
      preencherZeros(lote, 4),
      preencherZeros(unidade || "0", 3),
    ].join(".");
    document.getElementById("campo-inscricao").value = inscricao;
    mostrarToast("Inscrição gerada — confira antes de salvar.", "sucesso");
  });

  // -------- Autopreenchimento: CPF/CNPJ → dados do Contribuinte --------
  async function ligarBuscaContribuinte(prefixo) {
    const campoCpf = document.getElementById(`campo-${prefixo}-cpfcnpj`);
    const aviso = document.getElementById(`aviso-busca-${prefixo}`);
    async function buscar() {
      const valor = campoCpf.value.trim();
      if (!valor) return;
      aviso.textContent = "Buscando...";
      const contribuinte = await buscarContribuintePorCpfCnpj(valor);
      if (contribuinte) {
        document.getElementById(`campo-${prefixo}-nome`).value = contribuinte.nome;
        document.getElementById(`campo-${prefixo}-telefone`).value = contribuinte.telefone || "";
        document.getElementById(`campo-${prefixo}-celular`).value = contribuinte.celular || "";
        document.getElementById(`campo-${prefixo}-email`).value = contribuinte.email || "";
        area.dataset[`${prefixo}ContribuinteId`] = contribuinte.id;
        aviso.textContent = "✅ Contribuinte encontrado e dados preenchidos.";
      } else {
        area.dataset[`${prefixo}ContribuinteId`] = "";
        aviso.textContent = "Não encontrado no cadastro de Contribuintes — os dados serão salvos só neste boletim. Preencha manualmente ou cadastre-o em \"Contribuintes\" para reaproveitar depois.";
      }
    }
    document.getElementById(`btn-buscar-${prefixo}`)?.addEventListener("click", buscar);
    campoCpf.addEventListener("blur", buscar);
  }
  ligarBuscaContribuinte("proprietario");
  if (r.proprietarioContribuinteId) area.dataset.proprietarioContribuinteId = r.proprietarioContribuinteId;

  const campoMesmoResponsavel = document.getElementById("campo-mesmo-responsavel");
  const blocoResponsavel = document.getElementById("bloco-responsavel");
  campoMesmoResponsavel.addEventListener("change", () => {
    blocoResponsavel.classList.toggle("oculto", campoMesmoResponsavel.checked);
  });
  ligarBuscaContribuinte("responsavel");
  if (r.responsavelContribuinteId) area.dataset.responsavelContribuinteId = r.responsavelContribuinteId;

  // -------- Endereço de correspondência: copiar do endereço cadastrado do proprietário --------
  const campoCorrMesmo = document.getElementById("campo-corr-mesmo-proprietario");
  const blocoCorrEndereco = document.getElementById("bloco-corr-endereco");
  const avisoCorrMesmo = document.getElementById("aviso-corr-mesmo-proprietario");

  async function aplicarEnderecoCorrespondenciaDoProprietario() {
    blocoCorrEndereco.classList.add("oculto");
    avisoCorrMesmo.textContent = "Buscando o endereço cadastrado do proprietário...";
    const cpfProprietario = document.getElementById("campo-proprietario-cpfcnpj").value.trim();
    const contribuinte = area.dataset.proprietarioContribuinteId
      ? { id: area.dataset.proprietarioContribuinteId, ...(await colecaoEntidade("contribuintes").doc(area.dataset.proprietarioContribuinteId).get()).data() }
      : await buscarContribuintePorCpfCnpj(cpfProprietario);
    if (!contribuinte || (!contribuinte.endereco && !contribuinte.bairro && !contribuinte.cep)) {
      avisoCorrMesmo.textContent = "O proprietário não tem endereço cadastrado em Contribuintes — preencha manualmente abaixo ou cadastre o endereço dele em \"Contribuintes\".";
      campoCorrMesmo.checked = false;
      blocoCorrEndereco.classList.remove("oculto");
      return;
    }
    document.getElementById("campo-corr-endereco").value = contribuinte.endereco || "";
    document.getElementById("campo-corr-bairro").value = contribuinte.bairro || "";
    document.getElementById("campo-corr-cep").value = contribuinte.cep || "";
    avisoCorrMesmo.textContent = "✅ Endereço copiado do cadastro do proprietário.";
  }

  campoCorrMesmo.addEventListener("change", () => {
    if (campoCorrMesmo.checked) {
      aplicarEnderecoCorrespondenciaDoProprietario();
    } else {
      avisoCorrMesmo.textContent = "";
      blocoCorrEndereco.classList.remove("oculto");
    }
  });
  if (campoCorrMesmo.checked) aplicarEnderecoCorrespondenciaDoProprietario();

  // -------- Cálculo aproximado de área (retangular) --------
  area.querySelectorAll(".btn-calc-area").forEach((botao) => {
    botao.addEventListener("click", () => {
      const prefixo = botao.dataset.prefixo;
      const frente = parseFloat(document.getElementById(`campo-${prefixo}-frente`).value) || 0;
      const fundo = parseFloat(document.getElementById(`campo-${prefixo}-fundo`).value) || 0;
      const media = (frente + fundo) / 2;
      document.getElementById(`campo-${prefixo}-total`).value = media > 0 ? media.toFixed(2) : "";
      mostrarToast("Cálculo aproximado (retangular) aplicado — confira e ajuste se o terreno for irregular.", "info");
    });
  });

  // -------- Co-proprietários (11 — Demais Proprietários) --------
  function renderizarListaCoProprietarios() {
    const container = document.getElementById("lista-coproprietarios");
    if (coProprietarios.length === 0) {
      container.innerHTML = `<p class="texto-secundario">Nenhum co-proprietário adicionado.</p>`;
      return;
    }
    container.innerHTML = coProprietarios
      .map(
        (co, indice) => `
      <div class="linha-formulario linha-coproprietario" data-indice="${indice}">
        <div><label>Nome</label><input type="text" class="co-nome" value="${co.nome ? escaparHtml(co.nome) : ""}"></div>
        <div><label>CPF/CNPJ</label><input type="text" class="co-cpf" value="${co.cpfCnpj || ""}"></div>
        <div><label>% (opcional)</label><input type="number" step="0.01" class="co-percentual" value="${co.percentual || ""}" style="max-width:100px"></div>
        ${podeEditar ? `<button type="button" class="botao-icone btn-remover-co" data-indice="${indice}">🗑️</button>` : ""}
      </div>
    `
      )
      .join("");
    container.querySelectorAll(".btn-remover-co").forEach((botao) => {
      botao.addEventListener("click", () => {
        coProprietarios.splice(Number(botao.dataset.indice), 1);
        renderizarListaCoProprietarios();
      });
    });
  }
  renderizarListaCoProprietarios();
  document.getElementById("btn-add-coproprietario").addEventListener("click", () => {
    coProprietarios.push({ nome: "", cpfCnpj: "", percentual: "" });
    renderizarListaCoProprietarios();
  });

  // -------- GPS --------
  document.getElementById("btn-capturar-gps").addEventListener("click", () => {
    if (!navigator.geolocation) { mostrarToast("Este navegador não suporta captura de localização.", "erro"); return; }
    mostrarToast("Obtendo localização atual...", "info");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        document.getElementById("campo-latitude").value = posicao.coords.latitude.toFixed(6);
        document.getElementById("campo-longitude").value = posicao.coords.longitude.toFixed(6);
        mostrarToast("Localização capturada com sucesso.", "sucesso");
      },
      (erro) => {
        mostrarToast("Não foi possível obter a localização: " + erro.message, "erro");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  // -------- Croqui da unidade (desenho em canvas) --------
  if (registro?.id) {
    inicializarCroqui(registro.id, podeEditar);
  }

  // -------- Fotos (Firebase Storage) --------
  if (registro?.id) {
    carregarFotosBoletim(registro.id);
    document.getElementById("campo-fotos")?.addEventListener("change", (evento) => {
      uploadFotosBoletim(registro.id, evento.target.files);
    });
  }

  // -------- Exportar PDF --------
  document.getElementById("btn-exportar-pdf")?.addEventListener("click", (evento) => executarComFeedback(evento.target, () => exportarBoletimPDF(registro), "Gerando PDF..."));

  // -------- Excluir --------
  document.getElementById("btn-excluir-boletim")?.addEventListener("click", async (evento) => {
    if (!confirm(`Excluir o boletim "${registro.inscricaoImobiliaria}"? Essa ação não pode ser desfeita — inclusive as fotos, o croqui e os co-proprietários vinculados.`)) return;
    await executarComFeedback(evento.target, async () => {
      await excluirBoletimCompleto(registro.id);
      registrarHistorico("boletins", registro.id, "excluir", registro.inscricaoImobiliaria);
      mostrarToast("Boletim excluído.", "sucesso");
      renderizarBoletins(area);
    }, "Excluindo...");
  });

  // -------- Salvar --------
  document.getElementById("btn-salvar-boletim")?.addEventListener("click", async (evento) => {
    await salvarBoletim(evento.target, area, registro, { logradouros, quadras, condominios, tiposImovel, coProprietarios });
  });
}

function blocoMedidas(prefixo, r) {
  const chaveBase = prefixo === "terreno" ? "areaTerreno" : "areaConstruida";
  return `
    <div class="linha-formulario">
      <div><label>Frente</label><input type="number" step="0.01" id="campo-${prefixo}-frente" value="${r[chaveBase + "Frente"] || ""}"></div>
      <div><label>Fundo</label><input type="number" step="0.01" id="campo-${prefixo}-fundo" value="${r[chaveBase + "Fundo"] || ""}"></div>
    </div>
    <div class="linha-formulario">
      <div><label>Lado Direito</label><input type="number" step="0.01" id="campo-${prefixo}-lado-direito" value="${r[chaveBase + "LadoDireito"] || ""}"></div>
      <div><label>Lado Esquerdo</label><input type="number" step="0.01" id="campo-${prefixo}-lado-esquerdo" value="${r[chaveBase + "LadoEsquerdo"] || ""}"></div>
    </div>
    <div class="linha-formulario">
      <div><label>Quant. Total m²</label><input type="number" step="0.01" id="campo-${prefixo}-total" value="${r[chaveBase + "Total"] || ""}"></div>
      <div style="display:flex; align-items:flex-end"><button type="button" class="botao-secundario btn-calc-area" data-prefixo="${prefixo}">≈ Calcular (retangular)</button></div>
    </div>
  `;
}

async function salvarBoletim(botao, area, registro, cadastros) {
  const campoInscricao = document.getElementById("campo-inscricao");
  const campoLogradouroValor = document.getElementById("campo-logradouro-valor");
  const campoLogradouroTexto = document.getElementById("campo-logradouro-texto");
  const campoQuadraValor = document.getElementById("campo-quadra-valor");
  const campoQuadraTexto = document.getElementById("campo-quadra-texto");
  const campoTipoImovelValor = document.getElementById("campo-tipo-imovel-valor");
  const campoTipoImovelTexto = document.getElementById("campo-tipo-imovel-texto");
  const campoProprietarioNome = document.getElementById("campo-proprietario-nome");

  [campoInscricao, campoLogradouroTexto, campoQuadraTexto, campoTipoImovelTexto, campoProprietarioNome].forEach(limparCampoInvalido);

  let valido = true;
  if (!campoInscricao.value.trim()) { marcarCampoInvalido(campoInscricao, "Informe a inscrição imobiliária."); valido = false; }
  if (!campoLogradouroValor.value) { marcarCampoInvalido(campoLogradouroTexto, "Selecione o logradouro na lista de busca."); valido = false; }
  if (!campoQuadraValor.value) { marcarCampoInvalido(campoQuadraTexto, "Selecione a quadra na lista de busca."); valido = false; }
  if (!campoTipoImovelValor.value) { marcarCampoInvalido(campoTipoImovelTexto, "Selecione o tipo de imóvel na lista de busca."); valido = false; }
  if (!campoProprietarioNome.value.trim()) { marcarCampoInvalido(campoProprietarioNome, "Informe o nome do proprietário."); valido = false; }
  if (!valido) { mostrarToast("Confira os campos destacados em vermelho.", "erro"); return; }

  // Checa duplicidade de inscrição imobiliária (regra: nunca deixar duas inscrições iguais)
  const inscricao = campoInscricao.value.trim();
  const snapshotDuplicado = await colecaoEntidade("boletins").where("inscricaoImobiliaria", "==", inscricao).limit(2).get();
  const duplicado = snapshotDuplicado.docs.find((d) => d.id !== registro?.id);
  if (duplicado) {
    mostrarToast("Já existe outro boletim com essa inscrição imobiliária.", "erro");
    return;
  }

  await executarComFeedback(botao, async () => {
    const logradouro = cadastros.logradouros.find((l) => l.id === campoLogradouroValor.value);
    const quadra = cadastros.quadras.find((q) => q.id === campoQuadraValor.value);
    const condominio = cadastros.condominios.find((c) => c.id === document.getElementById("campo-condominio-valor").value);
    const tipoImovel = cadastros.tiposImovel.find((t) => t.id === campoTipoImovelValor.value);
    const mesmoResponsavel = document.getElementById("campo-mesmo-responsavel").checked;
    const loteFormatado = preencherZeros(document.getElementById("campo-lote").value, 4);
    const unidadeFormatada = document.getElementById("campo-unidade").value.trim() ? preencherZeros(document.getElementById("campo-unidade").value, 3) : "";
    const corrMesmoProprietario = document.getElementById("campo-corr-mesmo-proprietario").checked;

    const dados = {
      inscricaoImobiliaria: inscricao,
      inscricaoImobiliariaAnterior: document.getElementById("campo-inscricao-anterior").value.trim(),
      statusAtualizacao: document.getElementById("campo-status").value,

      logradouroId: logradouro.id, logradouroNome: logradouro.nome, logradouroTipo: logradouro.tipo || "",
      numero: document.getElementById("campo-numero").value.trim(),
      complemento: document.getElementById("campo-complemento").value.trim(),
      bairroId: logradouro.bairroId, bairroNome: logradouro.bairroNome, cep: logradouro.cep || "",
      quadraId: quadra.id, quadraNome: quadra.nome, quadraCodigo: quadra.codigo || "",
      setorId: quadra.setorId, setorNome: quadra.setorNome, setorCodigo: quadra.setorCodigo || "",
      distritoId: quadra.distritoId, distritoNome: quadra.distritoNome, distritoCodigo: quadra.distritoCodigo || "",
      lote: loteFormatado, unidade: unidadeFormatada,
      condominioId: condominio?.id || null, condominioNome: condominio?.nome || "",
      tipoImovelId: tipoImovel.id, tipoImovelNome: tipoImovel.nome,
      medidorAgua: document.getElementById("campo-medidor-agua").value.trim(),
      medidorEnergia: document.getElementById("campo-medidor-energia").value.trim(),

      proprietarioContribuinteId: area.dataset.proprietarioContribuinteId || null,
      proprietarioNome: campoProprietarioNome.value.trim(),
      proprietarioNomeNormalizado: normalizarTexto(campoProprietarioNome.value.trim()),
      proprietarioCpfCnpj: document.getElementById("campo-proprietario-cpfcnpj").value.trim(),
      proprietarioTelefone: document.getElementById("campo-proprietario-telefone").value.trim(),
      proprietarioCelular: document.getElementById("campo-proprietario-celular").value.trim(),
      proprietarioEmail: document.getElementById("campo-proprietario-email").value.trim(),

      mesmoResponsavelProprietario: mesmoResponsavel,
      responsavelContribuinteId: mesmoResponsavel ? null : area.dataset.responsavelContribuinteId || null,
      responsavelNome: mesmoResponsavel ? campoProprietarioNome.value.trim() : document.getElementById("campo-responsavel-nome").value.trim(),
      responsavelCpfCnpj: mesmoResponsavel ? document.getElementById("campo-proprietario-cpfcnpj").value.trim() : document.getElementById("campo-responsavel-cpfcnpj").value.trim(),
      responsavelTelefone: mesmoResponsavel ? document.getElementById("campo-proprietario-telefone").value.trim() : document.getElementById("campo-responsavel-telefone").value.trim(),
      responsavelCelular: mesmoResponsavel ? document.getElementById("campo-proprietario-celular").value.trim() : document.getElementById("campo-responsavel-celular").value.trim(),
      responsavelEmail: mesmoResponsavel ? document.getElementById("campo-proprietario-email").value.trim() : document.getElementById("campo-responsavel-email").value.trim(),

      corrMesmoProprietario,
      corrEndereco: document.getElementById("campo-corr-endereco").value.trim(),
      corrNumero: document.getElementById("campo-corr-numero").value.trim(),
      corrBairro: document.getElementById("campo-corr-bairro").value.trim(),
      corrCep: document.getElementById("campo-corr-cep").value.trim(),
      corrComplemento: document.getElementById("campo-corr-complemento").value.trim(),
      corrPais: document.getElementById("campo-corr-pais").value.trim(),
      corrMunicipio: document.getElementById("campo-corr-municipio").value.trim(),
      corrUf: document.getElementById("campo-corr-uf").value.trim(),

      areaTerrenoFrente: numeroOuNull("campo-terreno-frente"),
      areaTerrenoFundo: numeroOuNull("campo-terreno-fundo"),
      areaTerrenoLadoDireito: numeroOuNull("campo-terreno-lado-direito"),
      areaTerrenoLadoEsquerdo: numeroOuNull("campo-terreno-lado-esquerdo"),
      areaTerrenoTotal: numeroOuNull("campo-terreno-total"),
      areaConstruidaFrente: numeroOuNull("campo-construida-frente"),
      areaConstruidaFundo: numeroOuNull("campo-construida-fundo"),
      areaConstruidaLadoDireito: numeroOuNull("campo-construida-lado-direito"),
      areaConstruidaLadoEsquerdo: numeroOuNull("campo-construida-lado-esquerdo"),
      areaConstruidaTotal: numeroOuNull("campo-construida-total"),

      observacao: document.getElementById("campo-observacao").value.trim(),

      anoAquisicao: numeroOuNull("campo-ano-aquisicao"),
      dimAreaTerreno: numeroOuNull("campo-dim-area-terreno"),
      dimTestadaT1: numeroOuNull("campo-dim-t1"),
      dimAreaUnidade: numeroOuNull("campo-dim-area-unidade"),
      dimTestadaT2: numeroOuNull("campo-dim-t2"),
      dimAreaTotalEdificacao: numeroOuNull("campo-dim-area-total-edificacao"),
      dimTestadaT3: numeroOuNull("campo-dim-t3"),
      dimNumeroPavimentos: numeroOuNull("campo-dim-pavimentos"),
      dimTestadaT4: numeroOuNull("campo-dim-t4"),

      latitude: document.getElementById("campo-latitude").value || null,
      longitude: document.getElementById("campo-longitude").value || null,

      dataAtualizacao: dataLocalISO(),
      usuarioAtualizacaoNome: estado.dadosUsuario?.nome || estado.usuario?.email || "",
    };

    // Campos de código fixo (natureza, edificação, estrutura, etc.)
    Object.keys(CAMPOS_CODIGO).forEach((chave) => {
      const valor = document.getElementById(`campo-${chave}`)?.value || "";
      dados[chave] = valor;
      dados[chave + "Nome"] = nomeDoCodigo(CODIGOS_BCI[chave], valor);
    });

    let boletimId = registro?.id;
    if (registro) {
      await colecaoEntidade("boletins").doc(registro.id).update(dados);
      registrarHistorico("boletins", registro.id, "editar", inscricao);
    } else {
      dados.dataCadastro = dataLocalISO();
      const ref = await colecaoEntidade("boletins").add(dados);
      boletimId = ref.id;
      registrarHistorico("boletins", boletimId, "criar", inscricao);
    }

    // Grava a lista de co-proprietários por completo (apaga e recria —
    // simples e seguro pra listas pequenas como essa, evita ficar
    // comparando item a item o que mudou).
    const refCo = colecaoEntidade("boletins").doc(boletimId).collection("coProprietarios");
    const existentes = await refCo.get();
    const lote = db.batch();
    existentes.docs.forEach((doc) => lote.delete(doc.ref));
    document.querySelectorAll(".linha-coproprietario").forEach((linha) => {
      const nome = linha.querySelector(".co-nome").value.trim();
      if (!nome) return;
      lote.set(refCo.doc(), {
        nome,
        cpfCnpj: linha.querySelector(".co-cpf").value.trim(),
        percentual: parseFloat(linha.querySelector(".co-percentual").value) || null,
      });
    });
    await lote.commit();

    mostrarToast("Boletim salvo com sucesso.", "sucesso");
    const area2 = document.getElementById("area-conteudo");
    const registroAtualizado = { id: boletimId, ...dados };
    abrirEditorBoletim(area2, registroAtualizado);
  }, "Salvando...");
}

/**
 * Exclui um boletim por completo: apaga a subcoleção de co-proprietários,
 * as fotos e o croqui no Storage, e só então o documento principal —
 * evita deixar lixo de dados/armazenamento pendurado (subcoleção órfã,
 * arquivos no Storage sem nenhum documento apontando pra eles).
 */
async function excluirBoletimCompleto(boletimId) {
  const refBoletim = colecaoEntidade("boletins").doc(boletimId);
  const doc = await refBoletim.get();
  const dados = doc.data() || {};

  const snapshotCo = await refBoletim.collection("coProprietarios").get();
  const lote = db.batch();
  snapshotCo.docs.forEach((d) => lote.delete(d.ref));
  if (snapshotCo.docs.length > 0) await lote.commit();

  const arquivosParaApagar = [
    ...(dados.fotos || []).map((foto) => foto.caminho),
    dados.croquiCaminho,
  ].filter(Boolean);
  await Promise.all(
    arquivosParaApagar.map((caminho) =>
      storage.ref(caminho).delete().catch((erro) => console.warn("Arquivo já não existia no Storage:", caminho, erro))
    )
  );

  await refBoletim.delete();
}

function numeroOuNull(id) {
  const valor = document.getElementById(id)?.value;
  return valor === "" || valor === undefined ? null : parseFloat(valor);
}

// -------------------------------------------------------------
// CROQUI DA UNIDADE (desenho em canvas — Firebase Storage)
// -------------------------------------------------------------
// Desenho livre, com dedo ou mouse, salvo como PNG no mesmo Storage já
// usado pelas fotos. Um único arquivo por boletim (sobrescrito a cada
// "Salvar Croqui"), referenciado pelo campo `croquiUrl` do boletim.
async function inicializarCroqui(boletimId, podeEditar) {
  const canvas = document.getElementById("canvas-croqui");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Ajusta a resolução real do canvas ao tamanho exibido em tela,
  // pra não ficar borrado em telas de alta densidade (celular/tablet).
  function ajustarResolucaoCanvas() {
    const proporcao = window.devicePixelRatio || 1;
    const larguraExibida = canvas.clientWidth;
    const alturaExibida = canvas.clientHeight;
    const imagemAtual = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = larguraExibida * proporcao;
    canvas.height = alturaExibida * proporcao;
    ctx.scale(proporcao, proporcao);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (imagemAtual) ctx.putImageData(imagemAtual, 0, 0);
  }
  ajustarResolucaoCanvas();

  // Carrega o croqui já salvo, se existir
  try {
    const doc = await colecaoEntidade("boletins").doc(boletimId).get();
    const croquiUrl = doc.data()?.croquiUrl;
    if (croquiUrl) {
      const imagem = new Image();
      imagem.crossOrigin = "anonymous";
      imagem.onload = () => ctx.drawImage(imagem, 0, 0, canvas.clientWidth, canvas.clientHeight);
      imagem.src = croquiUrl;
    }
  } catch (erro) {
    console.warn("Não foi possível carregar o croqui salvo:", erro);
  }

  if (!podeEditar) return;

  const campoCor = document.getElementById("croqui-cor");
  const campoEspessura = document.getElementById("croqui-espessura");
  let desenhando = false;

  function posicaoRelativa(evento) {
    const retangulo = canvas.getBoundingClientRect();
    const ponto = evento.touches ? evento.touches[0] : evento;
    return { x: ponto.clientX - retangulo.left, y: ponto.clientY - retangulo.top };
  }

  function iniciarTraco(evento) {
    evento.preventDefault();
    desenhando = true;
    const { x, y } = posicaoRelativa(evento);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function continuarTraco(evento) {
    if (!desenhando) return;
    evento.preventDefault();
    const { x, y } = posicaoRelativa(evento);
    ctx.strokeStyle = campoCor.value;
    ctx.lineWidth = Number(campoEspessura.value);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function finalizarTraco() { desenhando = false; }

  canvas.addEventListener("mousedown", iniciarTraco);
  canvas.addEventListener("mousemove", continuarTraco);
  window.addEventListener("mouseup", finalizarTraco);
  canvas.addEventListener("touchstart", iniciarTraco, { passive: false });
  canvas.addEventListener("touchmove", continuarTraco, { passive: false });
  canvas.addEventListener("touchend", finalizarTraco);

  document.getElementById("btn-croqui-limpar").addEventListener("click", () => {
    if (!confirm("Limpar todo o desenho do croqui?")) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  document.getElementById("btn-croqui-salvar").addEventListener("click", async (evento) => {
    const statusEl = document.getElementById("status-croqui");
    await executarComFeedback(evento.target, async () => {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const caminho = `entidades/${estado.entidadeAtual}/boletins/${boletimId}/croqui.png`;
      const ref = storage.ref(caminho);
      await ref.put(blob, { contentType: "image/png" });
      const url = await ref.getDownloadURL();
      await colecaoEntidade("boletins").doc(boletimId).update({ croquiUrl: url, croquiCaminho: caminho });
      statusEl.textContent = "✅ Croqui salvo.";
      mostrarToast("Croqui salvo com sucesso.", "sucesso");
    }, "Salvando...");
  });
}

// -------------------------------------------------------------
// FOTOS DO IMÓVEL (Firebase Storage)
// -------------------------------------------------------------
async function carregarFotosBoletim(boletimId) {
  const grade = document.getElementById("grade-fotos");
  if (!grade) return;
  try {
    const doc = await colecaoEntidade("boletins").doc(boletimId).get();
    const fotos = doc.data()?.fotos || [];
    grade.innerHTML = fotos.length === 0
      ? `<p class="texto-secundario">Nenhuma foto anexada ainda.</p>`
      : fotos.map((foto, indice) => `
          <div class="miniatura-foto">
            <img src="${foto.url}" alt="Foto do imóvel">
            ${usuarioPodeEditar() ? `<button type="button" class="botao-icone btn-remover-foto" data-indice="${indice}">🗑️</button>` : ""}
          </div>
        `).join("");
    grade.querySelectorAll(".btn-remover-foto").forEach((botao) => {
      botao.addEventListener("click", () => removerFotoBoletim(boletimId, Number(botao.dataset.indice)));
    });
  } catch (erro) {
    console.error(erro);
  }
}

async function uploadFotosBoletim(boletimId, arquivos) {
  if (!arquivos || arquivos.length === 0) return;
  const grade = document.getElementById("grade-fotos");
  const barra = criarBarraProgressoInline(grade.parentElement, "Enviando fotos");
  try {
    const doc = await colecaoEntidade("boletins").doc(boletimId).get();
    const fotosAtuais = doc.data()?.fotos || [];
    const novasFotos = [];
    for (let i = 0; i < arquivos.length; i++) {
      barra.atualizar(i, arquivos.length);
      const blob = await redimensionarImagemParaBlob(arquivos[i]);
      const caminho = `entidades/${estado.entidadeAtual}/boletins/${boletimId}/fotos/${Date.now()}_${i}.jpg`;
      const ref = storage.ref(caminho);
      await ref.put(blob, { contentType: "image/jpeg" });
      const url = await ref.getDownloadURL();
      novasFotos.push({ url, caminho, dataUpload: dataLocalISO() });
    }
    barra.atualizar(arquivos.length, arquivos.length);
    await colecaoEntidade("boletins").doc(boletimId).update({ fotos: [...fotosAtuais, ...novasFotos] });
    mostrarToast("Fotos enviadas com sucesso.", "sucesso");
    carregarFotosBoletim(boletimId);
  } catch (erro) {
    console.error(erro);
    mostrarToast("Erro ao enviar fotos. Tente novamente.", "erro");
  } finally {
    barra.remover();
  }
}

async function removerFotoBoletim(boletimId, indice) {
  if (!confirm("Remover esta foto?")) return;
  try {
    const doc = await colecaoEntidade("boletins").doc(boletimId).get();
    const fotos = doc.data()?.fotos || [];
    const [removida] = fotos.splice(indice, 1);
    if (removida?.caminho) {
      try { await storage.ref(removida.caminho).delete(); } catch (e) { console.warn("Foto já não existia no Storage:", e); }
    }
    await colecaoEntidade("boletins").doc(boletimId).update({ fotos });
    carregarFotosBoletim(boletimId);
  } catch (erro) {
    mostrarToast("Erro ao remover a foto.", "erro");
  }
}

// -------------------------------------------------------------
// EXPORTAR BOLETIM EM PDF (todas as seções do BCI oficial, incluindo
// croqui — busca os dados mais recentes do boletim antes de gerar)
// -------------------------------------------------------------
async function exportarBoletimPDF(registroBase) {
  mostrarToast("Gerando PDF...", "info");

  const docFirestore = await colecaoEntidade("boletins").doc(registroBase.id).get();
  const registro = { id: registroBase.id, ...docFirestore.data() };
  const snapshotCo = await colecaoEntidade("boletins").doc(registroBase.id).collection("coProprietarios").get();
  const coProprietariosSalvos = snapshotCo.docs.map((d) => d.data());

  const doc = new jspdf.jsPDF();
  let y = 15;
  const margemEsquerda = 14;
  const larguraUtil = 182;

  function novaLinhaSeNecessario(alturaExtra = 8) {
    if (y > 280 - alturaExtra) { doc.addPage(); y = 15; }
  }

  function tituloSecao(texto) {
    novaLinhaSeNecessario(12);
    doc.setFillColor(13, 79, 196);
    doc.rect(margemEsquerda, y, larguraUtil, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text(texto, margemEsquerda + 2, y + 5);
    doc.setTextColor(0, 0, 0);
    y += 11;
  }

  function linhaCampo(rotulo, valor) {
    novaLinhaSeNecessario();
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    const textoRotulo = `${rotulo}:`;
    doc.text(textoRotulo, margemEsquerda, y);
    const larguraRotulo = doc.getTextWidth(textoRotulo);
    doc.setFont(undefined, "normal");
    const textoValor = String(valor ?? "-") || "-";

    // Rótulo curto: valor continua na mesma linha, logo depois do
    // rótulo (a posição é calculada pela largura real do texto, nunca
    // um deslocamento fixo — é isso que antes causava sobreposição em
    // rótulos longos como "Terreno — Frente/Fundo/Ld.Dir/Ld.Esq").
    // Rótulo longo: o valor desce pra linha de baixo, com recuo.
    if (larguraRotulo <= 62) {
      const xValor = margemEsquerda + larguraRotulo + 3;
      const linhas = doc.splitTextToSize(textoValor, larguraUtil - larguraRotulo - 3);
      doc.text(linhas, xValor, y);
      y += Math.max(6, linhas.length * 5);
    } else {
      y += 5;
      novaLinhaSeNecessario();
      const linhas = doc.splitTextToSize(textoValor, larguraUtil - 6);
      doc.text(linhas, margemEsquerda + 6, y);
      y += Math.max(6, linhas.length * 5) + 1;
    }
  }

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text(`${estado.entidadeAtualNome || "SOFT+"}`, margemEsquerda, y);
  y += 6;
  doc.setFontSize(11);
  doc.text("Boletim de Cadastro Imobiliário (BCI)", margemEsquerda, y);
  y += 9;

  tituloSecao("01/02 — Inscrição Imobiliária");
  linhaCampo("Inscrição Imobiliária Atual", registro.inscricaoImobiliaria);
  linhaCampo("Inscrição Imobiliária Anterior", registro.inscricaoImobiliariaAnterior);
  linhaCampo("Status", registro.statusAtualizacao === "atualizado" ? "Atualizado" : "Pendente de atualização");

  tituloSecao("03 — Localização do Imóvel");
  linhaCampo("Logradouro / Número", `${registro.logradouroTipo || ""} ${registro.logradouroNome || ""}, ${registro.numero || "s/n"}`);
  linhaCampo("Complemento", registro.complemento);
  linhaCampo("Bairro / CEP", `${registro.bairroNome || "-"} / ${registro.cep || "-"}`);
  linhaCampo("Distrito / Setor / Quadra", `${registro.distritoNome || "-"} / ${registro.setorNome || "-"} / ${registro.quadraNome || "-"}`);
  linhaCampo("Lote / Unidade", `${registro.lote || "-"} / ${registro.unidade || "-"}`);
  linhaCampo("Condomínio", registro.condominioNome);
  linhaCampo("Tipo de Imóvel", registro.tipoImovelNome);
  linhaCampo("Medidor Água / Energia", `${registro.medidorAgua || "-"} / ${registro.medidorEnergia || "-"}`);

  tituloSecao("Caracterização do Imóvel");
  linhaCampo("Natureza", registro.naturezaNome);
  linhaCampo("Edificação", registro.edificacaoNome);

  tituloSecao("04 — Dados do Proprietário");
  linhaCampo("Nome", registro.proprietarioNome);
  linhaCampo("CPF/CNPJ", registro.proprietarioCpfCnpj);
  linhaCampo("Telefone / Celular", `${registro.proprietarioTelefone || "-"} / ${registro.proprietarioCelular || "-"}`);
  linhaCampo("E-mail", registro.proprietarioEmail);

  tituloSecao("05 — Dados do Responsável pelo Pagamento");
  linhaCampo("Nome", registro.responsavelNome);
  linhaCampo("CPF/CNPJ", registro.responsavelCpfCnpj);
  linhaCampo("Telefone / Celular", `${registro.responsavelTelefone || "-"} / ${registro.responsavelCelular || "-"}`);

  tituloSecao("06 — Endereço para Correspondência");
  if (registro.corrMesmoProprietario) {
    linhaCampo("Endereço", "Mesmo endereço cadastrado do proprietário");
  } else {
    linhaCampo("Endereço / Número", `${registro.corrEndereco || "-"} / ${registro.corrNumero || "-"}`);
    linhaCampo("Bairro / CEP", `${registro.corrBairro || "-"} / ${registro.corrCep || "-"}`);
    linhaCampo("Complemento", registro.corrComplemento);
    linhaCampo("Município / UF / País", `${registro.corrMunicipio || "-"} / ${registro.corrUf || "-"} / ${registro.corrPais || "-"}`);
  }

  tituloSecao("10 — Medidas do Imóvel");
  linhaCampo("Terreno — Frente / Fundo", `${registro.areaTerrenoFrente ?? "-"} / ${registro.areaTerrenoFundo ?? "-"}`);
  linhaCampo("Terreno — Lado Direito / Esquerdo", `${registro.areaTerrenoLadoDireito ?? "-"} / ${registro.areaTerrenoLadoEsquerdo ?? "-"}`);
  linhaCampo("Terreno — Total m²", registro.areaTerrenoTotal);
  linhaCampo("Construída — Frente / Fundo", `${registro.areaConstruidaFrente ?? "-"} / ${registro.areaConstruidaFundo ?? "-"}`);
  linhaCampo("Construída — Lado Direito / Esquerdo", `${registro.areaConstruidaLadoDireito ?? "-"} / ${registro.areaConstruidaLadoEsquerdo ?? "-"}`);
  linhaCampo("Construída — Total m²", registro.areaConstruidaTotal);

  tituloSecao("11 — Demais Proprietários");
  if (coProprietariosSalvos.length === 0) {
    linhaCampo("Demais Proprietários", "Nenhum");
  } else {
    coProprietariosSalvos.forEach((co, indice) => {
      linhaCampo(`Proprietário ${indice + 2}`, `${co.nome || "-"} — CPF/CNPJ: ${co.cpfCnpj || "-"}${co.percentual ? ` — ${co.percentual}%` : ""}`);
    });
  }

  if (registro.observacao) {
    tituloSecao("12 — Observação");
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    const linhas = doc.splitTextToSize(registro.observacao, larguraUtil);
    doc.text(linhas, margemEsquerda, y);
    y += linhas.length * 5 + 4;
  }

  tituloSecao("Informação sobre a Edificação");
  linhaCampo("Estrutura", registro.estruturaNome);
  linhaCampo("Patrimônio", registro.patrimonioNome);
  linhaCampo("Utilização", registro.utilizacaoNome);
  linhaCampo("Limitação", registro.limitacaoNome);
  linhaCampo("Isenção IPTU / TSU", `${registro.isencaoIptuNome || "-"} / ${registro.isencaoTsuNome || "-"}`);

  tituloSecao("Informações Gerais sobre o Terreno");
  linhaCampo("Situação", registro.situacaoNome);
  linhaCampo("Topografia", registro.topografiaNome);
  linhaCampo("Pedologia", registro.pedologiaNome);
  linhaCampo("Posicionamento", registro.posicionamentoNome);

  tituloSecao("Fatores de Qualidade do Imóvel");
  linhaCampo("Cobertura / Forro", `${registro.coberturaNome || "-"} / ${registro.forroNome || "-"}`);
  linhaCampo("Paredes / Fachada", `${registro.paredesNome || "-"} / ${registro.fachadaNome || "-"}`);
  linhaCampo("Instalação Sanit. / Elétrica", `${registro.instalacaoSanitariaNome || "-"} / ${registro.instalacaoEletricaNome || "-"}`);
  linhaCampo("Piso / Conservação", `${registro.pisoNome || "-"} / ${registro.conservacaoNome || "-"}`);
  linhaCampo("Ano de Aquisição", registro.anoAquisicao);

  tituloSecao("Dimensões da Unidade");
  linhaCampo("Área do Terreno / Testada T1", `${registro.dimAreaTerreno ?? "-"} m² / ${registro.dimTestadaT1 ?? "-"}`);
  linhaCampo("Área da Unidade / Testada T2", `${registro.dimAreaUnidade ?? "-"} m² / ${registro.dimTestadaT2 ?? "-"}`);
  linhaCampo("Área Total da Edificação / Testada T3", `${registro.dimAreaTotalEdificacao ?? "-"} m² / ${registro.dimTestadaT3 ?? "-"}`);
  linhaCampo("Número de Pavimentos / Testada T4", `${registro.dimNumeroPavimentos ?? "-"} / ${registro.dimTestadaT4 ?? "-"}`);

  if (registro.latitude && registro.longitude) {
    linhaCampo("Localização GPS", `${registro.latitude}, ${registro.longitude}`);
  }

  // -------- Croquis da Unidade (imagem) --------
  if (registro.croquiUrl) {
    try {
      const respostaImagem = await fetch(registro.croquiUrl);
      const blobImagem = await respostaImagem.blob();
      const base64Imagem = await new Promise((resolve) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.readAsDataURL(blobImagem);
      });
      novaLinhaSeNecessario(100);
      tituloSecao("Croquis da Unidade");
      doc.addImage(base64Imagem, "PNG", margemEsquerda, y, larguraUtil, 80);
      y += 84;
    } catch (erro) {
      console.warn("Não foi possível incluir o croqui no PDF:", erro);
    }
  }

  novaLinhaSeNecessario(20);
  y += 10;
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} por ${estado.dadosUsuario?.nome || estado.usuario?.email}`, margemEsquerda, y);

  doc.save(`Boletim_${registro.inscricaoImobiliaria || "sem_inscricao"}.pdf`);
}
