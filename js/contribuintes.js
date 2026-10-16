// ===================================================================
// CONTRIBUINTES (proprietários / responsáveis pelo pagamento)
// ===================================================================
// Busca funciona tanto por nome quanto por CPF/CNPJ (com ou sem
// máscara) — usa dois campos normalizados diferentes porque o
// Firestore só permite um filtro de intervalo (prefixo) por consulta.

async function renderizarContribuintes(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Contribuintes</h2>
      ${usuarioPodeEditar() ? `<button class="botao-primario" id="btn-novo">+ Novo</button>` : ""}
    </div>
    <div class="barra-busca">
      <input type="text" id="campo-busca" placeholder="Buscar por nome ou CPF/CNPJ...">
    </div>
    <div id="lista-registros" class="lista-cartoes"></div>
    <button id="btn-carregar-mais" class="botao-secundario oculto">Carregar mais</button>
  `;

  const paginador = criarPaginador(colecaoEntidade("contribuintes").orderBy("nomeNormalizado"));

  async function carregarPagina(limpar = false) {
    const lista = document.getElementById("lista-registros");
    if (limpar) lista.innerHTML = "";
    try {
      const registros = await paginador.carregarProximaPagina();
      registros.forEach((registro) => lista.appendChild(criarCartao(registro)));
      document.getElementById("btn-carregar-mais").classList.toggle("oculto", !paginador.temMais);
      if (limpar && registros.length === 0) lista.innerHTML = `<p class="texto-secundario">Nenhum contribuinte cadastrado.</p>`;
    } catch (erro) {
      tratarErroConsultaFirestore(erro);
      document.getElementById("btn-carregar-mais").classList.add("oculto");
    }
  }

  function criarCartao(registro) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro cartao-clicavel";
    cartao.innerHTML = `
      <span><strong>${escaparHtml(registro.nome)}</strong> <span class="texto-secundario">— ${formatarCpfCnpj(registro.cpfCnpj)}</span></span>
      ${usuarioPodeEditar() ? `<div class="acoes-cartao"><button class="botao-icone" data-acao="editar">✏️</button><button class="botao-icone" data-acao="excluir">🗑️</button></div>` : ""}
    `;
    cartao.querySelector('[data-acao="editar"]')?.addEventListener("click", (e) => { e.stopPropagation(); abrirFormulario(registro); });
    cartao.querySelector('[data-acao="excluir"]')?.addEventListener("click", (e) => { e.stopPropagation(); excluir(registro); });
    cartao.addEventListener("click", () => abrirFormulario(registro));
    return cartao;
  }

  function abrirFormulario(registro = null) {
    criarModal(`${registro ? "Editar" : "Novo"} Contribuinte`, `
      <label>Nome / Razão Social *</label>
      <input type="text" id="campo-nome" value="${registro?.nome ? escaparHtml(registro.nome) : ""}">
      <label>CPF/CNPJ *</label>
      <input type="text" id="campo-cpfcnpj" value="${registro?.cpfCnpj || ""}" placeholder="Somente números ou com máscara">
      <div class="linha-formulario">
        <div><label>Telefone</label><input type="text" id="campo-telefone" value="${registro?.telefone || ""}"></div>
        <div><label>Celular</label><input type="text" id="campo-celular" value="${registro?.celular || ""}"></div>
      </div>
      <label>E-mail</label>
      <input type="email" id="campo-email" value="${registro?.email || ""}">
      <label>Endereço (logradouro e número)</label>
      <input type="text" id="campo-endereco" value="${registro?.endereco ? escaparHtml(registro.endereco) : ""}">
      <div class="linha-formulario">
        <div><label>Bairro</label><input type="text" id="campo-bairro" value="${registro?.bairro ? escaparHtml(registro.bairro) : ""}"></div>
        <div><label>CEP</label><input type="text" id="campo-cep" value="${registro?.cep || ""}"></div>
      </div>
    `, async (botaoSalvar) => {
      const campoNome = document.getElementById("campo-nome");
      const campoCpfCnpj = document.getElementById("campo-cpfcnpj");
      limparCampoInvalido(campoNome);
      limparCampoInvalido(campoCpfCnpj);
      const nome = campoNome.value.trim();
      const cpfCnpj = campoCpfCnpj.value.trim();
      let valido = true;
      if (!nome) { marcarCampoInvalido(campoNome, "Informe o nome."); valido = false; }
      if (!cpfCnpj) { marcarCampoInvalido(campoCpfCnpj, "Informe o CPF/CNPJ."); valido = false; }
      if (!valido) return;

      await executarComFeedback(botaoSalvar, async () => {
        const dados = {
          nome, nomeNormalizado: normalizarTexto(nome),
          cpfCnpj, cpfCnpjNormalizado: apenasDigitos(cpfCnpj),
          telefone: document.getElementById("campo-telefone").value.trim(),
          celular: document.getElementById("campo-celular").value.trim(),
          email: document.getElementById("campo-email").value.trim(),
          endereco: document.getElementById("campo-endereco").value.trim(),
          bairro: document.getElementById("campo-bairro").value.trim(),
          cep: document.getElementById("campo-cep").value.trim(),
        };
        if (registro) {
          await colecaoEntidade("contribuintes").doc(registro.id).update(dados);
          registrarHistorico("contribuintes", registro.id, "editar", nome);
        } else {
          const ref = await colecaoEntidade("contribuintes").add(dados);
          registrarHistorico("contribuintes", ref.id, "criar", nome);
        }
        fecharModal();
        mostrarToast("Contribuinte salvo com sucesso.", "sucesso");
        paginador.reiniciar();
        carregarPagina(true);
      });
    });
  }

  async function excluir(registro) {
    const referenciado = await existeReferenciaPara("contribuintes", registro.id);
    if (referenciado) { mostrarToast(`Não é possível excluir: usado em (${referenciado}).`, "erro"); return; }
    if (!confirm(`Excluir "${registro.nome}"?`)) return;
    await colecaoEntidade("contribuintes").doc(registro.id).delete();
    registrarHistorico("contribuintes", registro.id, "excluir", registro.nome);
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
      const termoOriginal = evento.target.value.trim();
      const lista = document.getElementById("lista-registros");
      lista.innerHTML = "";
      if (!termoOriginal) { paginador.reiniciar(); carregarPagina(true); return; }
      try {
        const ehNumerico = /^[0-9.\-\/\s]+$/.test(termoOriginal);
        let snapshot;
        if (ehNumerico) {
          const termo = apenasDigitos(termoOriginal);
          snapshot = await colecaoEntidade("contribuintes").orderBy("cpfCnpjNormalizado").startAt(termo).endAt(termo + "\uf8ff").limit(TAMANHO_PAGINA).get();
        } else {
          const termo = normalizarTexto(termoOriginal);
          snapshot = await colecaoEntidade("contribuintes").orderBy("nomeNormalizado").startAt(termo).endAt(termo + "\uf8ff").limit(TAMANHO_PAGINA).get();
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

function formatarCpfCnpj(valor) {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digitos.length === 14) return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return valor || "-";
}

/**
 * Usado pelo Boletim: busca um contribuinte já cadastrado a partir do
 * CPF/CNPJ digitado, pra auto-preencher nome/telefone/e-mail. Retorna
 * null se não encontrar (a tela do Boletim oferece cadastrar na hora).
 */
/**
 * Garante que o proprietário/responsável digitado num boletim exista como
 * Contribuinte. Por que existe: no Contabilis não há "proprietário" como
 * cadastro à parte — só Contribuinte. Antes da v1.16, quem não era
 * encontrado pelo CPF/CNPJ ficava salvo só dentro do boletim, e na
 * exportação sumia da tabela CONTRIBUINTE e deixava o sq_contribuinte do
 * IMOVEL em branco. Reaproveita o cadastro quando o CPF/CNPJ já existe.
 * Retorna { contribuinte, criado } ou null se não há nome.
 */
async function garantirContribuinteDoBoletim({ nome, cpfCnpj, telefone, celular, email, endereco, bairro, cep }) {
  const nomeLimpo = (nome || "").trim();
  if (!nomeLimpo) return null;
  const existente = await buscarContribuintePorCpfCnpj(cpfCnpj);
  if (existente) return { contribuinte: existente, criado: false };
  const dados = {
    nome: nomeLimpo, nomeNormalizado: normalizarTexto(nomeLimpo),
    cpfCnpj: (cpfCnpj || "").trim(), cpfCnpjNormalizado: apenasDigitos(cpfCnpj),
    telefone: telefone || "", celular: celular || "", email: email || "",
    endereco: endereco || "", bairro: bairro || "", cep: cep || "",
  };
  const ref = await colecaoEntidade("contribuintes").add(dados);
  registrarHistorico("contribuintes", ref.id, "criar", nomeLimpo);
  return { contribuinte: { id: ref.id, ...dados }, criado: true };
}

async function buscarContribuintePorCpfCnpj(cpfCnpjDigitado) {
  const termo = apenasDigitos(cpfCnpjDigitado);
  if (!termo) return null;
  const snapshot = await colecaoEntidade("contribuintes").where("cpfCnpjNormalizado", "==", termo).limit(1).get();
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}
