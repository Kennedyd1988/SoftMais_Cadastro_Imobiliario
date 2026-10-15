// ===================================================================
// CADASTRO DE APOIO GENÉRICO (nome único) — reaproveitado por Tipos de
// Imóvel, Distritos, Zonas e Condomínios, que têm a mesma estrutura.
// ===================================================================

/**
 * Checa referências antes de excluir um cadastro de apoio, evitando
 * deixar boletim com referência quebrada (ex: excluir um Distrito que
 * ainda tem Setores vinculados, ou um Bairro com Logradouros).
 */
const MAPA_REFERENCIAS_APOIO = {
  distritos: [{ colecao: "setores", campo: "distritoId", rotulo: "Setores" }],
  zonas: [{ colecao: "bairros", campo: "zonaId", rotulo: "Bairros" }],
  setores: [{ colecao: "quadras", campo: "setorId", rotulo: "Quadras" }],
  bairros: [{ colecao: "logradouros", campo: "bairroId", rotulo: "Logradouros" }],
  logradouros: [{ colecao: "boletins", campo: "logradouroId", rotulo: "Boletins" }],
  quadras: [{ colecao: "boletins", campo: "quadraId", rotulo: "Boletins" }],
  condominios: [{ colecao: "boletins", campo: "condominioId", rotulo: "Boletins" }],
  tiposImovel: [{ colecao: "boletins", campo: "tipoImovelId", rotulo: "Boletins" }],
  contribuintes: [
    { colecao: "boletins", campo: "proprietarioContribuinteId", rotulo: "Boletins (proprietário)" },
    { colecao: "boletins", campo: "responsavelContribuinteId", rotulo: "Boletins (responsável)" },
  ],
};

async function existeReferenciaPara(nomeColecao, id) {
  const referencias = MAPA_REFERENCIAS_APOIO[nomeColecao] || [];
  for (const referencia of referencias) {
    const snapshot = await colecaoEntidade(referencia.colecao).where(referencia.campo, "==", id).limit(1).get();
    if (!snapshot.empty) return referencia.rotulo;
  }
  return null;
}

async function renderizarCadastroApoio(area, nomeColecao, rotuloSingular, opcoesCampoCodigo = null) {
  // opcoesCampoCodigo, quando informado, ativa um campo extra de código
  // fixo (ex: código do Distrito, usado no padrão de inscrição
  // imobiliária). Formato: { rotulo, exemplo, tamanho, obrigatorio }
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>${rotuloSingular}s</h2>
      ${usuarioPodeEditar() ? `<button class="botao-primario" id="btn-novo">+ Novo</button>` : ""}
    </div>
    <div class="barra-busca">
      <input type="text" id="campo-busca" placeholder="Buscar ${rotuloSingular.toLowerCase()}...">
    </div>
    <div id="lista-registros" class="lista-cartoes"></div>
    <button id="btn-carregar-mais" class="botao-secundario oculto">Carregar mais</button>
  `;

  const paginador = criarPaginador(colecaoEntidade(nomeColecao).orderBy("nomeNormalizado"));

  async function carregarPagina(limpar = false) {
    const lista = document.getElementById("lista-registros");
    if (limpar) lista.innerHTML = "";
    try {
      const registros = await paginador.carregarProximaPagina();
      registros.forEach((registro) => lista.appendChild(criarCartaoApoio(registro)));
      document.getElementById("btn-carregar-mais").classList.toggle("oculto", !paginador.temMais);
      if (limpar && registros.length === 0) {
        lista.innerHTML = `<p class="texto-secundario">Nenhum registro encontrado.</p>`;
      }
    } catch (erro) {
      tratarErroConsultaFirestore(erro);
      document.getElementById("btn-carregar-mais").classList.add("oculto");
    }
  }

  function criarCartaoApoio(registro) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro cartao-clicavel";
    cartao.innerHTML = `
      <span>${opcoesCampoCodigo && registro.codigo ? `<span class="num">${registro.codigo}</span> — ` : ""}${registro.nome}</span>
      ${
        usuarioPodeEditar()
          ? `<div class="acoes-cartao">
               <button class="botao-icone" data-acao="editar">✏️</button>
               <button class="botao-icone" data-acao="excluir">🗑️</button>
             </div>`
          : ""
      }
    `;
    cartao.querySelector('[data-acao="editar"]')?.addEventListener("click", (evento) => {
      evento.stopPropagation();
      abrirFormulario(registro);
    });
    cartao.querySelector('[data-acao="excluir"]')?.addEventListener("click", (evento) => {
      evento.stopPropagation();
      excluirRegistro(registro);
    });
    cartao.addEventListener("click", () => abrirFormulario(registro));
    return cartao;
  }

  function abrirFormulario(registro = null) {
    const nomeAtual = registro?.nome || "";
    const codigoAtual = registro?.codigo || "";
    criarModal(
      `${registro ? "Editar" : "Novo"} ${rotuloSingular}`,
      `
      ${
        opcoesCampoCodigo
          ? `<label>${opcoesCampoCodigo.rotulo} ${opcoesCampoCodigo.obrigatorio ? "*" : ""}</label>
             <input type="text" id="campo-codigo" inputmode="numeric" maxlength="${opcoesCampoCodigo.tamanho || 4}" placeholder="Ex: ${opcoesCampoCodigo.exemplo}" value="${codigoAtual}">`
          : ""
      }
      <label>Nome *</label>
      <input type="text" id="campo-nome" value="${nomeAtual.replace(/"/g, "&quot;")}">
    `,
      async (botaoSalvar) => {
        const campoNome = document.getElementById("campo-nome");
        const campoCodigo = document.getElementById("campo-codigo");
        limparCampoInvalido(campoNome);
        if (campoCodigo) limparCampoInvalido(campoCodigo);

        const nome = campoNome.value.trim();
        let valido = true;
        if (!nome) {
          marcarCampoInvalido(campoNome, "Informe o nome.");
          valido = false;
        }
        if (opcoesCampoCodigo?.obrigatorio && campoCodigo && !campoCodigo.value.trim()) {
          marcarCampoInvalido(campoCodigo, `Informe o ${opcoesCampoCodigo.rotulo.toLowerCase()}.`);
          valido = false;
        }
        if (!valido) return;

        await executarComFeedback(botaoSalvar, async () => {
          const dados = { nome, nomeNormalizado: normalizarTexto(nome) };
          if (campoCodigo) dados.codigo = preencherZeros(campoCodigo.value.trim(), opcoesCampoCodigo.tamanho || 4);
          if (registro) {
            await colecaoEntidade(nomeColecao).doc(registro.id).update(dados);
            registrarHistorico(nomeColecao, registro.id, "editar", nome);
          } else {
            const ref = await colecaoEntidade(nomeColecao).add(dados);
            registrarHistorico(nomeColecao, ref.id, "criar", nome);
          }
          fecharModal();
          mostrarToast(`${rotuloSingular} salvo com sucesso.`, "sucesso");
          paginador.reiniciar();
          carregarPagina(true);
        });
      }
    );
  }

  async function excluirRegistro(registro) {
    const referenciado = await existeReferenciaPara(nomeColecao, registro.id);
    if (referenciado) {
      mostrarToast(`Não é possível excluir: este registro está sendo usado em (${referenciado}).`, "erro");
      return;
    }
    if (!confirm(`Excluir "${registro.nome}"?`)) return;
    await colecaoEntidade(nomeColecao).doc(registro.id).delete();
    registrarHistorico(nomeColecao, registro.id, "excluir", registro.nome);
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
      if (!termo) {
        paginador.reiniciar();
        carregarPagina(true);
        return;
      }
      try {
        const snapshot = await colecaoEntidade(nomeColecao)
          .orderBy("nomeNormalizado")
          .startAt(termo)
          .endAt(termo + "\uf8ff")
          .limit(TAMANHO_PAGINA)
          .get();
        snapshot.docs.forEach((doc) => lista.appendChild(criarCartaoApoio({ id: doc.id, ...doc.data() })));
        if (snapshot.empty) lista.innerHTML = `<p class="texto-secundario">Nenhum resultado encontrado.</p>`;
        document.getElementById("btn-carregar-mais").classList.add("oculto");
      } catch (erro) {
        tratarErroConsultaFirestore(erro);
      }
    }, 300);
  });

  carregarPagina(true);
}
