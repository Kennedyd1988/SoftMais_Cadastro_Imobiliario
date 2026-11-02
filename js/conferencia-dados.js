// ===================================================================
// CONFERÊNCIA DE DADOS (só administrador)
// ===================================================================
// Acha e corrige, em uma tela, os problemas que travam a importação no
// Contabilis (descobertos a partir de relatórios de exportação reais):
//   1. imóveis (boletins) com a mesma inscrição imobiliária;
//   2. contribuintes com o mesmo CPF/CNPJ (unifica: aponta os boletins
//      para o cadastro mantido, completa os campos vazios e apaga o outro);
//   3. CPF/CNPJ de contribuinte inválido ou em branco (corrige na hora);
//   4. boletins sem bairro (copia o bairro do logradouro do próprio boletim).
// É uma verificação sob demanda que lê boletins e contribuintes por
// inteiro (em lotes, por ID) — por isso fica restrita ao administrador e só
// roda quando se clica em "Verificar", nunca ao abrir a tela.
// Toda alteração/exclusão gera registro no Histórico.

async function lerColecaoPorIdConferencia(nomeColecao) {
  return buscarColecaoEmLotes(colecaoEntidade(nomeColecao).orderBy(firebase.firestore.FieldPath.documentId()));
}

async function renderizarConferenciaDados(area) {
  if (!usuarioEhAdministrador()) { area.innerHTML = `<p class="texto-secundario">Somente administradores.</p>`; return; }
  area.innerHTML = `
    <div class="cabecalho-pagina"><h2>Conferência de Dados</h2></div>
    <p class="texto-secundario">
      Procura problemas que atrapalham a exportação para o Contabilis: imóveis duplicados,
      contribuintes com CPF repetido ou inválido e boletins sem bairro. Nada é alterado
      sem você clicar no botão de cada item.
    </p>
    <button class="botao-primario" id="btn-verificar-dados">🔍 Verificar agora</button>
    <div id="resultado-conferencia" style="margin-top:16px"></div>
  `;
  document.getElementById("btn-verificar-dados").addEventListener("click", (evento) => {
    executarComFeedback(evento.target, verificarDadosConferencia, "Verificando...");
  });
}

async function verificarDadosConferencia() {
  const container = document.getElementById("resultado-conferencia");
  container.innerHTML = `<p class="texto-secundario">Lendo boletins e contribuintes...</p>`;
  const [boletins, contribuintes, logradouros] = await Promise.all([
    lerColecaoPorIdConferencia("boletins"), lerColecaoPorIdConferencia("contribuintes"), lerColecaoPorIdConferencia("logradouros"),
  ]);
  const mapaLogradouros = new Map(logradouros.map((l) => [l.id, l]));
  const codigoValido = (v) => /^\d+$/.test(String(v || ""));

  // ---- 1. inscrição repetida ----
  const porInscricao = new Map();
  boletins.forEach((b) => {
    const chave = apenasDigitos(b.inscricaoImobiliaria);
    if (!chave) return;
    if (!porInscricao.has(chave)) porInscricao.set(chave, []);
    porInscricao.get(chave).push(b);
  });
  const gruposInscricao = [...porInscricao.values()].filter((g) => g.length > 1);

  // ---- 2. CPF repetido ----
  const porCpf = new Map();
  contribuintes.forEach((c) => {
    const chave = c.cpfCnpjNormalizado || apenasDigitos(c.cpfCnpj);
    if (!chave) return;
    if (!porCpf.has(chave)) porCpf.set(chave, []);
    porCpf.get(chave).push(c);
  });
  const gruposCpf = [...porCpf.values()].filter((g) => g.length > 1);

  // ---- 3. CPF inválido / em branco ----
  const cpfInvalido = contribuintes.filter((c) => !cpfCnpjValido(c.cpfCnpjNormalizado || c.cpfCnpj));

  // ---- 4. boletim sem bairro ----
  const semBairro = boletins.filter((b) => !b.bairroId);
  const corrigiveis = semBairro.filter((b) => mapaLogradouros.get(b.logradouroId)?.bairroId);

  const usosDoContribuinte = (id) => boletins.filter((b) => b.proprietarioContribuinteId === id || b.responsavelContribuinteId === id).length;
  const rotuloBoletim = (b) => `${escaparHtml(b.inscricaoImobiliaria || "(sem inscrição)")} — ${escaparHtml(`${b.logradouroTipo ? b.logradouroTipo + " " : ""}${b.logradouroNome || ""} ${b.numero || ""}`)} — ${escaparHtml(b.proprietarioNome || "sem proprietário")} — cadastro ${escaparHtml(b.dataCadastro || "?")}${b.id.startsWith("legado_") ? " <strong>(veio do legado)</strong>" : ""}${codigoValido(b.origemLegadoId) ? ` — código ${b.origemLegadoId}` : ""}`;
  const rotuloContribuinte = (c) => `${escaparHtml(c.nome)} — ${escaparHtml(c.cpfCnpj || "sem CPF")} — ${escaparHtml(c.endereco || "sem endereço")} — tel ${escaparHtml(c.telefone || c.celular || "-")} — ${usosDoContribuinte(c.id)} boletim(ns)${c.id.startsWith("legado_") ? " <strong>(veio do legado)</strong>" : ""}${codigoValido(c.codigoLegado) ? ` — código ${c.codigoLegado}` : ""}`;

  container.innerHTML = `
    <h3>1. Imóveis com a mesma inscrição (${gruposInscricao.length})</h3>
    ${gruposInscricao.length === 0 ? `<p class="texto-secundario">Nenhum.</p>` : gruposInscricao.map((g) => `
      <div class="cartao" style="margin-bottom:12px">
        ${g.map((b) => `<div style="margin:6px 0">${rotuloBoletim(b)}
          <button class="botao-perigo" data-acao="excluir-boletim" data-id="${b.id}">Excluir este</button></div>`).join("")}
      </div>`).join("")}

    <h3>2. Contribuintes com o mesmo CPF/CNPJ (${gruposCpf.length})</h3>
    ${gruposCpf.length === 0 ? `<p class="texto-secundario">Nenhum.</p>` : gruposCpf.map((g, i) => `
      <div class="cartao" style="margin-bottom:12px" data-grupo="${i}">
        ${g.map((c) => `<div style="margin:6px 0">${rotuloContribuinte(c)}
          <button class="botao-secundario" data-acao="unificar" data-grupo="${i}" data-id="${c.id}">Manter este e unificar</button></div>`).join("")}
      </div>`).join("")}

    <h3>3. Contribuintes com CPF/CNPJ inválido ou em branco (${cpfInvalido.length})</h3>
    ${cpfInvalido.length === 0 ? `<p class="texto-secundario">Nenhum.</p>` : cpfInvalido.slice(0, 300).map((c) => `
      <div class="linha-formulario" style="margin:6px 0">
        <div><label>${escaparHtml(c.nome)}${codigoValido(c.codigoLegado) ? ` (código ${c.codigoLegado})` : ""}</label>
        <input type="text" inputmode="numeric" data-cpf-id="${c.id}" value="${escaparHtml(c.cpfCnpj || "")}">
        <button class="botao-secundario" data-acao="salvar-cpf" data-id="${c.id}">Salvar CPF</button></div>
      </div>`).join("")}

    <h3>4. Boletins sem bairro (${semBairro.length})</h3>
    ${semBairro.length === 0 ? `<p class="texto-secundario">Nenhum.</p>` : `
      <p class="texto-secundario">${corrigiveis.length} podem ser corrigidos usando o bairro do logradouro do próprio boletim; ${semBairro.length - corrigiveis.length} não (o logradouro também está sem bairro — corrija em Logradouros).</p>
      ${semBairro.slice(0, 50).map((b) => `<div class="texto-secundario">${rotuloBoletim(b)}</div>`).join("")}
      ${corrigiveis.length > 0 ? `<button class="botao-secundario" data-acao="corrigir-bairro">Corrigir ${corrigiveis.length} pelo bairro do logradouro</button>` : ""}`}
  `;

  container.onclick = async (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    const acao = botao.dataset.acao;
    const recarregar = () => verificarDadosConferencia();

    if (acao === "excluir-boletim") {
      const b = boletins.find((x) => x.id === botao.dataset.id);
      if (!window.confirm(`Excluir DEFINITIVAMENTE este boletim?\n\n${b.inscricaoImobiliaria} — ${b.logradouroNome} ${b.numero || ""} — ${b.proprietarioNome}`)) return;
      await executarComFeedback(botao, async () => {
        await excluirBoletimCompleto(b.id);
        registrarHistorico("boletins", b.id, "excluir", b.inscricaoImobiliaria);
        mostrarToast("Boletim excluído.", "sucesso");
      }, "Excluindo...");
      await recarregar();
    }

    if (acao === "unificar") {
      const grupo = gruposCpf[Number(botao.dataset.grupo)];
      const mantido = grupo.find((c) => c.id === botao.dataset.id);
      const outros = grupo.filter((c) => c.id !== mantido.id);
      if (!window.confirm(`Manter "${mantido.nome}" e apagar ${outros.length} cadastro(s) duplicado(s)?\nOs boletins ligados aos duplicados passam a apontar para o mantido.`)) return;
      await executarComFeedback(botao, async () => {
        const camposTexto = ["telefone", "celular", "email", "endereco", "bairro", "cep"];
        const completar = {};
        outros.forEach((o) => {
          camposTexto.forEach((k) => { if (!mantido[k] && !completar[k] && o[k]) completar[k] = o[k]; });
          if (!codigoValido(mantido.codigoLegado) && !completar.codigoLegado && codigoValido(o.codigoLegado)) completar.codigoLegado = o.codigoLegado;
        });
        if (Object.keys(completar).length > 0) {
          await colecaoEntidade("contribuintes").doc(mantido.id).update(completar);
          registrarHistorico("contribuintes", mantido.id, "editar", `${mantido.nome} (unificado)`);
        }
        for (const o of outros) {
          for (const b of boletins.filter((x) => x.proprietarioContribuinteId === o.id || x.responsavelContribuinteId === o.id)) {
            const alteracao = {};
            if (b.proprietarioContribuinteId === o.id) alteracao.proprietarioContribuinteId = mantido.id;
            if (b.responsavelContribuinteId === o.id) alteracao.responsavelContribuinteId = mantido.id;
            await colecaoEntidade("boletins").doc(b.id).update(alteracao);
          }
          await colecaoEntidade("contribuintes").doc(o.id).delete();
          registrarHistorico("contribuintes", o.id, "excluir", o.nome);
        }
        mostrarToast("Contribuintes unificados.", "sucesso");
      }, "Unificando...");
      await recarregar();
    }

    if (acao === "salvar-cpf") {
      const campo = container.querySelector(`[data-cpf-id="${botao.dataset.id}"]`);
      limparCampoInvalido(campo);
      if (!cpfCnpjValido(campo.value)) { marcarCampoInvalido(campo, "CPF/CNPJ inválido — confira os dígitos."); return; }
      const c = contribuintes.find((x) => x.id === botao.dataset.id);
      await executarComFeedback(botao, async () => {
        await colecaoEntidade("contribuintes").doc(c.id).update({ cpfCnpj: formatarCpfCnpj(campo.value), cpfCnpjNormalizado: apenasDigitos(campo.value) });
        registrarHistorico("contribuintes", c.id, "editar", c.nome);
        mostrarToast("CPF/CNPJ salvo.", "sucesso");
      }, "Salvando...");
      await recarregar();
    }

    if (acao === "corrigir-bairro") {
      await executarComFeedback(botao, async () => {
        for (const b of corrigiveis) {
          const logradouro = mapaLogradouros.get(b.logradouroId);
          await colecaoEntidade("boletins").doc(b.id).update({ bairroId: logradouro.bairroId, bairroNome: logradouro.bairroNome || "" });
          registrarHistorico("boletins", b.id, "editar", b.inscricaoImobiliaria);
        }
        mostrarToast(`${corrigiveis.length} boletim(ns) corrigido(s).`, "sucesso");
      }, "Corrigindo...");
      await recarregar();
    }
  };
}
