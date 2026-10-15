// ===================================================================
// CADASTROS DE LOCALIZAÇÃO — Setor, Quadra, Bairro, Logradouro
// ===================================================================
// Diferente de "boletins" (que cresce sem limite e por isso é sempre
// paginado), essas listas são naturalmente limitadas pela geografia do
// município (algumas dezenas de bairros/quadras, no máximo). Por isso
// carregamos a lista inteira de uma vez pra popular os <select> — não
// fere a regra de paginação, que é sobre listas que crescem sem limite.
async function carregarListaCompleta(nomeColecao, ordenarPor = "nomeNormalizado") {
  const snapshot = await colecaoEntidade(nomeColecao).orderBy(ordenarPor).get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function montarOpcoesSelect(lista, idSelecionado, rotuloVazio = "Selecione...") {
  return (
    `<option value="">${rotuloVazio}</option>` +
    lista.map((item) => `<option value="${item.id}" ${item.id === idSelecionado ? "selected" : ""}>${item.nome}</option>`).join("")
  );
}

// -------------------------------------------------------------
// SETORES (vinculado a Distrito)
// -------------------------------------------------------------
async function renderizarSetores(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Setores</h2>
      ${usuarioPodeEditar() ? `<button class="botao-primario" id="btn-novo">+ Novo</button>` : ""}
    </div>
    <div id="lista-registros" class="lista-cartoes"><p class="texto-secundario">Carregando...</p></div>
  `;

  const distritos = await carregarListaCompleta("distritos");
  if (distritos.length === 0 && usuarioPodeEditar()) {
    mostrarToast("Cadastre ao menos um Distrito antes de criar Setores.", "info");
  }

  async function carregarLista() {
    const registros = await carregarListaCompleta("setores");
    const lista = document.getElementById("lista-registros");
    lista.innerHTML = "";
    if (registros.length === 0) {
      lista.innerHTML = `<p class="texto-secundario">Nenhum setor cadastrado.</p>`;
      return;
    }
    registros.forEach((registro) => lista.appendChild(criarCartao(registro)));
  }

  function criarCartao(registro) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro cartao-clicavel";
    cartao.innerHTML = `
      <span>${registro.codigo ? `<span class="num">${registro.codigo}</span> — ` : ""}${registro.nome} <span class="texto-secundario">— ${registro.distritoNome || "sem distrito"}</span></span>
      ${usuarioPodeEditar() ? `<div class="acoes-cartao"><button class="botao-icone" data-acao="editar">✏️</button><button class="botao-icone" data-acao="excluir">🗑️</button></div>` : ""}
    `;
    cartao.querySelector('[data-acao="editar"]')?.addEventListener("click", (e) => { e.stopPropagation(); abrirFormulario(registro); });
    cartao.querySelector('[data-acao="excluir"]')?.addEventListener("click", (e) => { e.stopPropagation(); excluir(registro); });
    cartao.addEventListener("click", () => abrirFormulario(registro));
    return cartao;
  }

  function abrirFormulario(registro = null) {
    const distritoAtual = distritos.find((d) => d.id === registro?.distritoId);
    criarModal(`${registro ? "Editar" : "Novo"} Setor`, `
      <label>Código do Setor (2 dígitos) *</label>
      <input type="text" id="campo-codigo" inputmode="numeric" maxlength="2" placeholder="Ex: 01" value="${registro?.codigo || ""}">
      <label>Nome/Número *</label>
      <input type="text" id="campo-nome" value="${registro?.nome || ""}">
      <label>Distrito *</label>
      ${htmlComboBusca("campo-distrito", distritoAtual?.nome, "Buscar distrito...")}
    `, async (botaoSalvar) => {
      const campoNome = document.getElementById("campo-nome");
      const campoCodigo = document.getElementById("campo-codigo");
      const campoDistritoValor = document.getElementById("campo-distrito-valor");
      limparCampoInvalido(campoNome);
      limparCampoInvalido(campoCodigo);
      const nome = campoNome.value.trim();
      let valido = true;
      if (!nome) { marcarCampoInvalido(campoNome, "Informe o nome/número."); valido = false; }
      if (!campoCodigo.value.trim()) { marcarCampoInvalido(campoCodigo, "Informe o código."); valido = false; }
      if (!campoDistritoValor.value) { mostrarToast("Selecione o distrito na lista de busca.", "erro"); valido = false; }
      if (!valido) return;

      await executarComFeedback(botaoSalvar, async () => {
        const distrito = distritos.find((d) => d.id === campoDistritoValor.value);
        const dados = {
          nome, nomeNormalizado: normalizarTexto(nome),
          codigo: preencherZeros(campoCodigo.value, 2),
          distritoId: distrito.id, distritoNome: distrito.nome, distritoCodigo: distrito.codigo || "",
          tocadoManualmente: true,
        };
        if (registro) {
          await colecaoEntidade("setores").doc(registro.id).update(dados);
          registrarHistorico("setores", registro.id, "editar", nome);
        } else {
          const ref = await colecaoEntidade("setores").add(dados);
          registrarHistorico("setores", ref.id, "criar", nome);
        }
        fecharModal();
        mostrarToast("Setor salvo com sucesso.", "sucesso");
        carregarLista();
      });
    });
    ativarComboBusca("campo-distrito", distritos, registro?.distritoId, () => {});
  }

  async function excluir(registro) {
    const referenciado = await existeReferenciaPara("setores", registro.id);
    if (referenciado) { mostrarToast(`Não é possível excluir: usado em (${referenciado}).`, "erro"); return; }
    if (!confirm(`Excluir "${registro.nome}"?`)) return;
    await colecaoEntidade("setores").doc(registro.id).delete();
    registrarHistorico("setores", registro.id, "excluir", registro.nome);
    mostrarToast("Excluído com sucesso.", "sucesso");
    carregarLista();
  }

  document.getElementById("btn-novo")?.addEventListener("click", () => abrirFormulario());
  carregarLista();
}

// -------------------------------------------------------------
// QUADRAS (vinculado a Setor, que já traz o Distrito)
// -------------------------------------------------------------
async function renderizarQuadras(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Quadras</h2>
      ${usuarioPodeEditar() ? `<button class="botao-primario" id="btn-novo">+ Nova</button>` : ""}
    </div>
    <div id="lista-registros" class="lista-cartoes"><p class="texto-secundario">Carregando...</p></div>
  `;

  const setores = await carregarListaCompleta("setores");

  async function carregarLista() {
    const registros = await carregarListaCompleta("quadras");
    const lista = document.getElementById("lista-registros");
    lista.innerHTML = "";
    if (registros.length === 0) { lista.innerHTML = `<p class="texto-secundario">Nenhuma quadra cadastrada.</p>`; return; }
    registros.forEach((registro) => lista.appendChild(criarCartao(registro)));
  }

  function criarCartao(registro) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro cartao-clicavel";
    cartao.innerHTML = `
      <span>${registro.codigo ? `<span class="num">${registro.codigo}</span> — ` : ""}Quadra ${registro.nome} <span class="texto-secundario">— Setor ${registro.setorNome || "?"} / ${registro.distritoNome || "?"}</span></span>
      ${usuarioPodeEditar() ? `<div class="acoes-cartao"><button class="botao-icone" data-acao="editar">✏️</button><button class="botao-icone" data-acao="excluir">🗑️</button></div>` : ""}
    `;
    cartao.querySelector('[data-acao="editar"]')?.addEventListener("click", (e) => { e.stopPropagation(); abrirFormulario(registro); });
    cartao.querySelector('[data-acao="excluir"]')?.addEventListener("click", (e) => { e.stopPropagation(); excluir(registro); });
    cartao.addEventListener("click", () => abrirFormulario(registro));
    return cartao;
  }

  function abrirFormulario(registro = null) {
    const setorAtual = setores.find((s) => s.id === registro?.setorId);
    criarModal(`${registro ? "Editar" : "Nova"} Quadra`, `
      <label>Código da Quadra (3 dígitos) *</label>
      <input type="text" id="campo-codigo" inputmode="numeric" maxlength="3" placeholder="Ex: 001" value="${registro?.codigo || ""}">
      <label>Número/Nome da Quadra *</label>
      <input type="text" id="campo-nome" value="${registro?.nome || ""}">
      <label>Setor *</label>
      ${htmlComboBusca("campo-setor", setorAtual ? `${setorAtual.nome} (${setorAtual.distritoNome})` : "", "Buscar setor...")}
    `, async (botaoSalvar) => {
      const campoNome = document.getElementById("campo-nome");
      const campoCodigo = document.getElementById("campo-codigo");
      const campoSetorValor = document.getElementById("campo-setor-valor");
      limparCampoInvalido(campoNome);
      limparCampoInvalido(campoCodigo);
      const nome = campoNome.value.trim();
      let valido = true;
      if (!nome) { marcarCampoInvalido(campoNome, "Informe o número/nome da quadra."); valido = false; }
      if (!campoCodigo.value.trim()) { marcarCampoInvalido(campoCodigo, "Informe o código."); valido = false; }
      if (!campoSetorValor.value) { mostrarToast("Selecione o setor na lista de busca.", "erro"); valido = false; }
      if (!valido) return;

      await executarComFeedback(botaoSalvar, async () => {
        const setor = setores.find((s) => s.id === campoSetorValor.value);
        const dados = {
          nome, nomeNormalizado: normalizarTexto(nome),
          codigo: preencherZeros(campoCodigo.value, 3),
          setorId: setor.id, setorNome: setor.nome, setorCodigo: setor.codigo || "",
          distritoId: setor.distritoId, distritoNome: setor.distritoNome, distritoCodigo: setor.distritoCodigo || "",
          tocadoManualmente: true,
        };
        if (registro) {
          await colecaoEntidade("quadras").doc(registro.id).update(dados);
          registrarHistorico("quadras", registro.id, "editar", nome);
        } else {
          const ref = await colecaoEntidade("quadras").add(dados);
          registrarHistorico("quadras", ref.id, "criar", nome);
        }
        fecharModal();
        mostrarToast("Quadra salva com sucesso.", "sucesso");
        carregarLista();
      });
    });
    ativarComboBusca("campo-setor", setores.map((s) => ({ id: s.id, nome: `${s.nome} (${s.distritoNome})` })), registro?.setorId, () => {});
  }

  async function excluir(registro) {
    const referenciado = await existeReferenciaPara("quadras", registro.id);
    if (referenciado) { mostrarToast(`Não é possível excluir: usado em (${referenciado}).`, "erro"); return; }
    if (!confirm(`Excluir "Quadra ${registro.nome}"?`)) return;
    await colecaoEntidade("quadras").doc(registro.id).delete();
    registrarHistorico("quadras", registro.id, "excluir", registro.nome);
    mostrarToast("Excluída com sucesso.", "sucesso");
    carregarLista();
  }

  document.getElementById("btn-novo")?.addEventListener("click", () => abrirFormulario());
  carregarLista();
}

// -------------------------------------------------------------
// BAIRROS (vinculado a Zona)
// -------------------------------------------------------------
async function renderizarBairros(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Bairros</h2>
      ${usuarioPodeEditar() ? `<button class="botao-primario" id="btn-novo">+ Novo</button>` : ""}
    </div>
    <div id="lista-registros" class="lista-cartoes"><p class="texto-secundario">Carregando...</p></div>
  `;

  const zonas = await carregarListaCompleta("zonas");

  async function carregarLista() {
    const registros = await carregarListaCompleta("bairros");
    const lista = document.getElementById("lista-registros");
    lista.innerHTML = "";
    if (registros.length === 0) { lista.innerHTML = `<p class="texto-secundario">Nenhum bairro cadastrado.</p>`; return; }
    registros.forEach((registro) => lista.appendChild(criarCartao(registro)));
  }

  function criarCartao(registro) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro cartao-clicavel";
    cartao.innerHTML = `
      <span>${registro.nome} <span class="texto-secundario">— ${registro.zonaNome || "sem zona"}</span></span>
      ${usuarioPodeEditar() ? `<div class="acoes-cartao"><button class="botao-icone" data-acao="editar">✏️</button><button class="botao-icone" data-acao="excluir">🗑️</button></div>` : ""}
    `;
    cartao.querySelector('[data-acao="editar"]')?.addEventListener("click", (e) => { e.stopPropagation(); abrirFormulario(registro); });
    cartao.querySelector('[data-acao="excluir"]')?.addEventListener("click", (e) => { e.stopPropagation(); excluir(registro); });
    cartao.addEventListener("click", () => abrirFormulario(registro));
    return cartao;
  }

  function abrirFormulario(registro = null) {
    const zonaAtual = zonas.find((z) => z.id === registro?.zonaId);
    criarModal(`${registro ? "Editar" : "Novo"} Bairro`, `
      <label>Nome *</label>
      <input type="text" id="campo-nome" value="${registro?.nome || ""}">
      <label>Zona *</label>
      ${htmlComboBusca("campo-zona", zonaAtual?.nome, "Buscar zona...")}
    `, async (botaoSalvar) => {
      const campoNome = document.getElementById("campo-nome");
      const campoZonaValor = document.getElementById("campo-zona-valor");
      limparCampoInvalido(campoNome);
      const nome = campoNome.value.trim();
      let valido = true;
      if (!nome) { marcarCampoInvalido(campoNome, "Informe o nome."); valido = false; }
      if (!campoZonaValor.value) { mostrarToast("Selecione a zona na lista de busca.", "erro"); valido = false; }
      if (!valido) return;

      await executarComFeedback(botaoSalvar, async () => {
        const zona = zonas.find((z) => z.id === campoZonaValor.value);
        const dados = {
          nome, nomeNormalizado: normalizarTexto(nome),
          zonaId: zona.id, zonaNome: zona.nome,
          tocadoManualmente: true,
        };
        if (registro) {
          await colecaoEntidade("bairros").doc(registro.id).update(dados);
          registrarHistorico("bairros", registro.id, "editar", nome);
        } else {
          const ref = await colecaoEntidade("bairros").add(dados);
          registrarHistorico("bairros", ref.id, "criar", nome);
        }
        fecharModal();
        mostrarToast("Bairro salvo com sucesso.", "sucesso");
        carregarLista();
      });
    });
    ativarComboBusca("campo-zona", zonas, registro?.zonaId, () => {});
  }

  async function excluir(registro) {
    const referenciado = await existeReferenciaPara("bairros", registro.id);
    if (referenciado) { mostrarToast(`Não é possível excluir: usado em (${referenciado}).`, "erro"); return; }
    if (!confirm(`Excluir "${registro.nome}"?`)) return;
    await colecaoEntidade("bairros").doc(registro.id).delete();
    registrarHistorico("bairros", registro.id, "excluir", registro.nome);
    mostrarToast("Excluído com sucesso.", "sucesso");
    carregarLista();
  }

  document.getElementById("btn-novo")?.addEventListener("click", () => abrirFormulario());
  carregarLista();
}

// -------------------------------------------------------------
// LOGRADOUROS (vinculado a Bairro, com CEP e código já embutidos —
// é esse vínculo que permite o auto-preenchimento no Boletim: ao
// escolher o logradouro, Bairro e CEP vêm junto automaticamente).
// -------------------------------------------------------------
async function renderizarLogradouros(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Logradouros</h2>
      ${usuarioPodeEditar() ? `<button class="botao-primario" id="btn-novo">+ Novo</button>` : ""}
    </div>
    <div class="barra-busca">
      <input type="text" id="campo-busca" placeholder="Buscar logradouro...">
    </div>
    <div id="lista-registros" class="lista-cartoes"></div>
    <button id="btn-carregar-mais" class="botao-secundario oculto">Carregar mais</button>
  `;

  const bairros = await carregarListaCompleta("bairros");
  const paginador = criarPaginador(colecaoEntidade("logradouros").orderBy("nomeNormalizado"));

  async function carregarPagina(limpar = false) {
    const lista = document.getElementById("lista-registros");
    if (limpar) lista.innerHTML = "";
    try {
      const registros = await paginador.carregarProximaPagina();
      registros.forEach((registro) => lista.appendChild(criarCartao(registro)));
      document.getElementById("btn-carregar-mais").classList.toggle("oculto", !paginador.temMais);
      if (limpar && registros.length === 0) lista.innerHTML = `<p class="texto-secundario">Nenhum logradouro cadastrado.</p>`;
    } catch (erro) {
      tratarErroConsultaFirestore(erro);
      document.getElementById("btn-carregar-mais").classList.add("oculto");
    }
  }

  function criarCartao(registro) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro cartao-clicavel";
    cartao.innerHTML = `
      <span>${registro.tipo ? registro.tipo + " " : ""}${registro.nome} <span class="texto-secundario">— ${registro.bairroNome || "?"} · CEP ${registro.cep || "-"}</span></span>
      ${usuarioPodeEditar() ? `<div class="acoes-cartao"><button class="botao-icone" data-acao="editar">✏️</button><button class="botao-icone" data-acao="excluir">🗑️</button></div>` : ""}
    `;
    cartao.querySelector('[data-acao="editar"]')?.addEventListener("click", (e) => { e.stopPropagation(); abrirFormulario(registro); });
    cartao.querySelector('[data-acao="excluir"]')?.addEventListener("click", (e) => { e.stopPropagation(); excluir(registro); });
    cartao.addEventListener("click", () => abrirFormulario(registro));
    return cartao;
  }

  function abrirFormulario(registro = null) {
    const bairroAtual = bairros.find((b) => b.id === registro?.bairroId);
    criarModal(`${registro ? "Editar" : "Novo"} Logradouro`, `
      <div class="linha-formulario">
        <div>
          <label>Tipo</label>
          <select id="campo-tipo">
            <option value="">-</option>
            ${CODIGOS_BCI.tipoLogradouro.map((t) => `<option value="${t}" ${registro?.tipo === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Nome *</label>
          <input type="text" id="campo-nome" value="${registro?.nome || ""}">
        </div>
      </div>
      <label>Bairro *</label>
      ${htmlComboBusca("campo-bairro", bairroAtual?.nome, "Buscar bairro...")}
      <label>CEP</label>
      <input type="text" id="campo-cep" value="${registro?.cep || ""}" placeholder="00000-000">
      <label>Código do logradouro (legado, opcional)</label>
      <input type="text" id="campo-codigo-legado" value="${registro?.codigoLegado || ""}">
    `, async (botaoSalvar) => {
      const campoNome = document.getElementById("campo-nome");
      const campoBairroValor = document.getElementById("campo-bairro-valor");
      limparCampoInvalido(campoNome);
      const nome = campoNome.value.trim();
      let valido = true;
      if (!nome) { marcarCampoInvalido(campoNome, "Informe o nome."); valido = false; }
      if (!campoBairroValor.value) { mostrarToast("Selecione o bairro na lista de busca.", "erro"); valido = false; }
      if (!valido) return;

      await executarComFeedback(botaoSalvar, async () => {
        const bairro = bairros.find((b) => b.id === campoBairroValor.value);
        const dados = {
          nome, nomeNormalizado: normalizarTexto(nome),
          tipo: document.getElementById("campo-tipo").value,
          bairroId: bairro.id, bairroNome: bairro.nome,
          cep: document.getElementById("campo-cep").value.trim(),
          codigoLegado: document.getElementById("campo-codigo-legado").value.trim(),
          tocadoManualmente: true,
        };
        if (registro) {
          await colecaoEntidade("logradouros").doc(registro.id).update(dados);
          registrarHistorico("logradouros", registro.id, "editar", nome);
        } else {
          const ref = await colecaoEntidade("logradouros").add(dados);
          registrarHistorico("logradouros", ref.id, "criar", nome);
        }
        fecharModal();
        mostrarToast("Logradouro salvo com sucesso.", "sucesso");
        paginador.reiniciar();
        carregarPagina(true);
      });
    });
    ativarComboBusca("campo-bairro", bairros, registro?.bairroId, () => {});
  }

  async function excluir(registro) {
    const referenciado = await existeReferenciaPara("logradouros", registro.id);
    if (referenciado) { mostrarToast(`Não é possível excluir: usado em (${referenciado}).`, "erro"); return; }
    if (!confirm(`Excluir "${registro.nome}"?`)) return;
    await colecaoEntidade("logradouros").doc(registro.id).delete();
    registrarHistorico("logradouros", registro.id, "excluir", registro.nome);
    mostrarToast("Excluído com sucesso.", "sucesso");
    paginador.reiniciar();
    carregarPagina(true);
  }

  document.getElementById("btn-novo")?.addEventListener("click", () => abrirFormulario());
  document.getElementById("btn-carregar-mais").addEventListener("click", () => carregarPagina(false));

  let temporizadorBusca;
  document.getElementById("campo-busca").addEventListener("input", (evento) => {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(async () => {
      const termo = normalizarTexto(evento.target.value);
      const lista = document.getElementById("lista-registros");
      lista.innerHTML = "";
      if (!termo) { paginador.reiniciar(); carregarPagina(true); return; }
      try {
        const snapshot = await colecaoEntidade("logradouros").orderBy("nomeNormalizado").startAt(termo).endAt(termo + "\uf8ff").limit(TAMANHO_PAGINA).get();
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
