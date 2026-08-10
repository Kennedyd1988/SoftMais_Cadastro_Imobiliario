// ===================================================================
// NÚCLEO DO APP — autenticação, permissões, navegação, utilidades
// ===================================================================

const VERSAO_APP = "1.2";
document.addEventListener("DOMContentLoaded", () => {
  const elementoLogin = document.getElementById("versao-app-login");
  if (elementoLogin) elementoLogin.textContent = `v${VERSAO_APP}`;
});

// Estado global em memória (não usar localStorage/sessionStorage —
// mantemos tudo em variáveis JS, recarregadas a cada login)
const estado = {
  usuario: null,
  dadosUsuario: null,
  entidadeAtual: null,
  entidadeAtualNome: "",
  entidadeAtualDados: null,
};

// -------------------------------------------------------------
// UTILIDADES GERAIS
// -------------------------------------------------------------
function escaparHtml(texto) {
  if (texto === null || texto === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(texto);
  return div.innerHTML;
}

function normalizarTexto(texto) {
  return (texto || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Mantém só dígitos — usado em CPF/CNPJ/CEP/telefone pra permitir buscar digitando com ou sem máscara */
function apenasDigitos(texto) {
  return (texto || "").toString().replace(/\D/g, "");
}

/** Completa um código numérico com zeros à esquerda até o tamanho fixo do padrão de inscrição imobiliária */
function preencherZeros(valor, tamanho) {
  return apenasDigitos(valor).padStart(tamanho, "0").slice(-tamanho);
}

/**
 * Tenta extrair um código numérico de um texto (ex: "SETOR 04" → "04").
 * Usado na importação do legado, onde nem sempre existe uma coluna de
 * código separada — o número já vem embutido no nome do registro.
 * Se não achar nenhum dígito, cai no valor de sequência informado.
 */
function extrairCodigoNumerico(texto, tamanho, valorSequencial) {
  const encontrado = String(texto || "").match(/\d+/);
  if (encontrado) return preencherZeros(encontrado[0], tamanho);
  return preencherZeros(String(valorSequencial ?? "0"), tamanho);
}

function mostrarToast(mensagem, tipo = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensagem;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("toast-visivel"), 10);
  setTimeout(() => {
    toast.classList.remove("toast-visivel");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatarData(dataIso) {
  if (!dataIso) return "-";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** AAAA-MM-DD local, sem o problema de toISOString() "voltar" um dia à noite no fuso do Brasil */
function dataLocalISO(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function tratarErroConsultaFirestore(erro) {
  console.error("Erro ao consultar o Firestore:", erro);
  if (erro?.message?.includes("requires an index") || erro?.code === "failed-precondition") {
    mostrarToast(
      "Essa consulta precisa de um índice novo no Firestore. Veja o link no Console do navegador (F12) para criá-lo.",
      "erro"
    );
  } else {
    mostrarToast("Erro ao carregar a lista. Tente novamente.", "erro");
  }
}

function criarBarraProgressoInline(container, rotuloInicial = "Processando") {
  const div = document.createElement("div");
  div.className = "barra-progresso-inline";
  div.innerHTML = `
    <div class="texto-status-upload">${rotuloInicial}...</div>
    <div class="barra-progresso-container">
      <div class="barra-progresso-preenchimento" style="width:0%"></div>
    </div>
  `;
  container.appendChild(div);
  const textoEl = div.querySelector(".texto-status-upload");
  const barraEl = div.querySelector(".barra-progresso-preenchimento");
  return {
    atualizar(feitos, total, rotulo = rotuloInicial) {
      const percentual = total > 0 ? Math.round((feitos / total) * 100) : 0;
      textoEl.textContent = `${rotulo}... ${feitos}/${total} (${percentual}%)`;
      barraEl.style.width = `${percentual}%`;
    },
    atualizarPercentual(percentual, rotulo = rotuloInicial) {
      textoEl.textContent = `${rotulo}... ${percentual}%`;
      barraEl.style.width = `${percentual}%`;
    },
    remover() {
      div.remove();
    },
  };
}

async function executarComFeedback(botao, funcaoAssincrona, textoProcessando = "Salvando...") {
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = textoProcessando;
  try {
    await funcaoAssincrona();
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

function marcarCampoInvalido(elemento, mensagem) {
  elemento.classList.add("campo-invalido");
  let aviso = elemento.parentElement.querySelector(".aviso-campo");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.className = "aviso-campo";
    elemento.parentElement.appendChild(aviso);
  }
  aviso.textContent = mensagem;
}

function limparCampoInvalido(elemento) {
  elemento.classList.remove("campo-invalido");
  const aviso = elemento.parentElement.querySelector(".aviso-campo");
  if (aviso) aviso.remove();
}

// -------------------------------------------------------------
// PAGINAÇÃO GENÉRICA (padrão: 50 registros por vez, com cursor)
// -------------------------------------------------------------
const TAMANHO_PAGINA = 50;

function criarPaginador(consultaBase) {
  let ultimoDocumento = null;
  let acabou = false;
  return {
    async carregarProximaPagina() {
      if (acabou) return [];
      let consulta = consultaBase.limit(TAMANHO_PAGINA);
      if (ultimoDocumento) consulta = consulta.startAfter(ultimoDocumento);
      const snapshot = await consulta.get();
      if (snapshot.empty || snapshot.docs.length < TAMANHO_PAGINA) acabou = true;
      if (!snapshot.empty) ultimoDocumento = snapshot.docs[snapshot.docs.length - 1];
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    reiniciar() {
      ultimoDocumento = null;
      acabou = false;
    },
    get temMais() {
      return !acabou;
    },
  };
}

// -------------------------------------------------------------
// PERMISSÕES
// -------------------------------------------------------------
function usuarioEhAdministrador() {
  return estado.dadosUsuario?.papel === "administrador";
}

function usuarioPodeEditar() {
  const papel = estado.dadosUsuario?.papel;
  return papel === "administrador" || papel === "cadastrador";
}

function usuarioTemAcessoAba(nomeAba) {
  if (usuarioEhAdministrador()) return true;
  return (estado.dadosUsuario?.abasPermitidas || []).includes(nomeAba);
}

function usuarioTemAcessoEntidade(entidadeId) {
  if (usuarioEhAdministrador()) return true;
  return (estado.dadosUsuario?.unidadesGestoras || []).includes(entidadeId);
}

// -------------------------------------------------------------
// AUTENTICAÇÃO
// -------------------------------------------------------------
auth.onAuthStateChanged(async (usuario) => {
  if (usuario) {
    estado.usuario = usuario;
    try {
      const doc = await db.collection("usuarios").doc(usuario.uid).get();
      if (!doc.exists) {
        mostrarToast("Seu usuário não tem cadastro de permissões. Contate o administrador.", "erro");
        await auth.signOut();
        return;
      }
      estado.dadosUsuario = doc.data();
      iniciarApp();
    } catch (erro) {
      console.error("Erro ao carregar dados do usuário:", erro);
      mostrarToast("Erro ao carregar permissões. Tente novamente.", "erro");
    }
  } else {
    estado.usuario = null;
    estado.dadosUsuario = null;
    mostrarTelaLogin();
  }
});

function mostrarTelaLogin() {
  document.getElementById("tela-login").classList.remove("oculto");
  document.getElementById("app-container").classList.add("oculto");
  document.getElementById("tela-selecao-entidade").classList.add("oculto");
}

async function fazerLogin(email, senha) {
  await auth.signInWithEmailAndPassword(email, senha);
}

async function fazerLogout() {
  await auth.signOut();
}

// -------------------------------------------------------------
// INICIALIZAÇÃO DO APP (após login confirmado)
// -------------------------------------------------------------
async function iniciarApp() {
  document.getElementById("tela-login").classList.add("oculto");
  document.getElementById("nome-usuario-logado").textContent = estado.dadosUsuario.nome || estado.usuario.email;

  const entidades = await carregarListaEntidadesDoUsuario();
  if (entidades.length === 0) {
    mostrarToast("Nenhum ente/prefeitura liberado para este usuário.", "erro");
    return;
  }

  popularSeletorEntidadeHeader(entidades);

  if (entidades.length === 1) {
    abrirAppComEntidade(entidades[0]);
  } else {
    mostrarTelaSelecaoEntidade(entidades);
  }
}

async function carregarListaEntidadesDoUsuario() {
  let entidades = [];
  if (usuarioEhAdministrador()) {
    const snapshot = await db.collection("entidades").orderBy("nome").get();
    entidades = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    const ids = estado.dadosUsuario.unidadesGestoras || [];
    const consultas = await Promise.all(ids.map((id) => db.collection("entidades").doc(id).get()));
    entidades = consultas
      .filter((d) => d.exists)
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  return entidades;
}

function popularSeletorEntidadeHeader(entidades) {
  const seletor = document.getElementById("seletor-entidade");
  seletor.innerHTML = "";
  entidades.forEach((entidade) => {
    const opcao = document.createElement("option");
    opcao.value = entidade.id;
    opcao.textContent = entidade.nome;
    seletor.appendChild(opcao);
  });
  seletor.addEventListener("change", () => {
    const entidade = entidades.find((e) => e.id === seletor.value);
    definirEntidadeAtual(entidade);
    montarMenuLateral();
  });
}

function definirEntidadeAtual(entidade) {
  estado.entidadeAtual = entidade.id;
  estado.entidadeAtualNome = entidade.nome;
  estado.entidadeAtualDados = entidade;
}

function mostrarTelaSelecaoEntidade(entidades) {
  const lista = document.getElementById("lista-entidades-selecao");
  lista.innerHTML = entidades
    .map(
      (entidade) => `
    <button type="button" class="item-selecao-entidade" data-id="${entidade.id}">
      ${entidade.logoBase64 ? `<img src="${entidade.logoBase64}" alt="">` : `<span class="icone-entidade-generico">🏛️</span>`}
      <span>${entidade.nome}</span>
    </button>
  `
    )
    .join("");

  document.getElementById("tela-selecao-entidade").classList.remove("oculto");

  lista.querySelectorAll(".item-selecao-entidade").forEach((botao) => {
    botao.addEventListener("click", () => {
      const entidade = entidades.find((e) => e.id === botao.dataset.id);
      document.getElementById("seletor-entidade").value = entidade.id;
      document.getElementById("tela-selecao-entidade").classList.add("oculto");
      abrirAppComEntidade(entidade);
    });
  });
}

function abrirAppComEntidade(entidade) {
  definirEntidadeAtual(entidade);
  document.getElementById("seletor-entidade").value = entidade.id;
  document.getElementById("app-container").classList.remove("oculto");
  montarMenuLateral();
}

// -------------------------------------------------------------
// NAVEGAÇÃO ENTRE MÓDULOS (single page, sem reload)
// -------------------------------------------------------------
const ITENS_MENU = [
  { chave: "inicio", rotulo: "Início", icone: "🏠", modulo: null, grupo: null },

  { chave: "boletins", rotulo: "Boletins (BCI)", icone: "🏘️", modulo: "boletins", grupo: "Cadastro Imobiliário" },
  { chave: "relatorios", rotulo: "Relatórios e Progresso", icone: "📊", modulo: "relatorios", grupo: "Cadastro Imobiliário" },

  { chave: "contribuintes", rotulo: "Contribuintes (Proprietários)", icone: "🧑‍💼", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "logradouros", rotulo: "Logradouros", icone: "🛣️", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "bairros", rotulo: "Bairros", icone: "📍", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "quadras", rotulo: "Quadras", icone: "▦", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "setores", rotulo: "Setores", icone: "🗺️", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "distritos", rotulo: "Distritos", icone: "🏞️", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "zonas", rotulo: "Zonas", icone: "🧭", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "condominios", rotulo: "Condomínios", icone: "🏢", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },
  { chave: "tipos-imovel", rotulo: "Tipos de Imóvel", icone: "⚙️", modulo: "cadastrosApoio", grupo: "Cadastros de Apoio" },

  { chave: "importacao-legado", rotulo: "Importação do Legado", icone: "📥", modulo: null, somenteAdmin: true, grupo: "Administração" },
  { chave: "usuarios", rotulo: "Usuários", icone: "👤", modulo: "usuarios", somenteAdmin: true, grupo: "Administração" },
  { chave: "unidades-gestoras", rotulo: "Prefeituras / Entes", icone: "🏛️", modulo: "unidadesGestoras", somenteAdmin: true, grupo: "Administração" },
  { chave: "historico", rotulo: "Histórico", icone: "🕒", modulo: "historico", somenteAdmin: true, grupo: "Administração" },
];

let paginaAtual = "inicio";
let registroPendenteParaAbrir = null;
function navegarParaRegistro(chave, id) {
  registroPendenteParaAbrir = { chave, id };
  navegarPara(chave);
}

function montarMenuLateral() {
  const menu = document.getElementById("menu-lateral");
  menu.innerHTML = "";

  let grupoAtual = undefined;
  let containerGrupoAtual = menu;

  ITENS_MENU.forEach((item) => {
    if (item.somenteAdmin && !usuarioEhAdministrador()) return;
    if (item.modulo && item.chave !== "usuarios" && item.chave !== "unidades-gestoras") {
      if (!usuarioTemAcessoAba(item.modulo)) return;
    }

    if (item.grupo !== grupoAtual) {
      grupoAtual = item.grupo;
      if (grupoAtual) {
        const cabecalho = document.createElement("button");
        cabecalho.type = "button";
        cabecalho.className = "grupo-menu";
        cabecalho.innerHTML = `<span class="seta-grupo-menu">▼</span> ${grupoAtual}`;

        const containerItens = document.createElement("div");
        containerItens.className = "itens-grupo-menu";

        cabecalho.addEventListener("click", () => {
          const recolhido = containerItens.classList.toggle("oculto");
          cabecalho.querySelector(".seta-grupo-menu").textContent = recolhido ? "▶" : "▼";
        });

        menu.appendChild(cabecalho);
        menu.appendChild(containerItens);
        containerGrupoAtual = containerItens;
      } else {
        containerGrupoAtual = menu;
      }
    }

    const botao = document.createElement("button");
    botao.className = "item-menu";
    botao.dataset.chave = item.chave;
    botao.innerHTML = `<span class="icone-menu">${item.icone}</span> ${item.rotulo}`;
    botao.addEventListener("click", () => navegarPara(item.chave));
    containerGrupoAtual.appendChild(botao);
  });

  const rodapeVersao = document.createElement("div");
  rodapeVersao.className = "versao-app";
  rodapeVersao.textContent = `SOFT+ Cadastro Imobiliário — v${VERSAO_APP}`;
  menu.appendChild(rodapeVersao);

  document.getElementById("versao-app-login").textContent = `v${VERSAO_APP}`;

  navegarPara("inicio");
}

function navegarPara(chave) {
  paginaAtual = chave;

  document.querySelectorAll(".item-menu").forEach((botao) => {
    botao.classList.toggle("item-menu-ativo", botao.dataset.chave === chave);
  });

  document.getElementById("menu-lateral").classList.remove("menu-aberto");

  const area = document.getElementById("area-conteudo");
  area.innerHTML = "";

  switch (chave) {
    case "inicio":
      renderizarInicio(area);
      break;
    case "boletins":
      renderizarBoletins(area);
      break;
    case "relatorios":
      renderizarRelatorios(area);
      break;
    case "contribuintes":
      renderizarContribuintes(area);
      break;
    case "logradouros":
      renderizarLogradouros(area);
      break;
    case "bairros":
      renderizarBairros(area);
      break;
    case "quadras":
      renderizarQuadras(area);
      break;
    case "setores":
      renderizarSetores(area);
      break;
    case "distritos":
      renderizarCadastroApoio(area, "distritos", "Distrito", { rotulo: "Código do Distrito (2 dígitos)", exemplo: "01", tamanho: 2, obrigatorio: true });
      break;
    case "zonas":
      renderizarCadastroApoio(area, "zonas", "Zona");
      break;
    case "condominios":
      renderizarCadastroApoio(area, "condominios", "Condomínio");
      break;
    case "tipos-imovel":
      renderizarCadastroApoio(area, "tiposImovel", "Tipo de Imóvel");
      break;
    case "importacao-legado":
      renderizarImportacaoLegado(area);
      break;
    case "usuarios":
      renderizarUsuarios(area);
      break;
    case "unidades-gestoras":
      renderizarUnidadesGestoras(area);
      break;
    case "historico":
      renderizarHistorico(area);
      break;
    default:
      area.innerHTML = "<p>Página não encontrada.</p>";
  }
}

async function renderizarInicio(area) {
  const logoEntidade = estado.entidadeAtualDados?.logoBase64;
  area.innerHTML = `
    <div class="cartao-boas-vindas">
      ${logoEntidade ? `<img src="${logoEntidade}" alt="Logo" class="logo-boas-vindas">` : ""}
      <div>
        <h2>Bem-vindo(a), ${estado.dadosUsuario.nome || estado.usuario.email}</h2>
        <p>Ente/Prefeitura atual: <strong>${estado.entidadeAtualNome}</strong></p>
      </div>
    </div>
    <div id="area-dashboard"><p class="texto-secundario" style="margin-top:16px">Calculando resumo da atualização cadastral...</p></div>
  `;

  if (!usuarioTemAcessoAba("boletins") && !usuarioEhAdministrador()) {
    document.getElementById("area-dashboard").innerHTML = `<p class="texto-secundario" style="margin-top:16px">Use o menu ao lado para acessar os cadastros.</p>`;
    return;
  }

  try {
    const [totalGeral, totalAtualizados, totalPendentes] = await Promise.all([
      colecaoEntidade("boletins").count ? colecaoEntidade("boletins").count().get() : colecaoEntidade("boletins").get(),
      colecaoEntidade("boletins").where("statusAtualizacao", "==", "atualizado").count
        ? colecaoEntidade("boletins").where("statusAtualizacao", "==", "atualizado").count().get()
        : colecaoEntidade("boletins").where("statusAtualizacao", "==", "atualizado").get(),
      colecaoEntidade("boletins").where("statusAtualizacao", "==", "pendente").count
        ? colecaoEntidade("boletins").where("statusAtualizacao", "==", "pendente").count().get()
        : colecaoEntidade("boletins").where("statusAtualizacao", "==", "pendente").get(),
    ]);

    const total = totalGeral.data ? totalGeral.data().count : totalGeral.size;
    const atualizados = totalAtualizados.data ? totalAtualizados.data().count : totalAtualizados.size;
    const pendentes = totalPendentes.data ? totalPendentes.data().count : totalPendentes.size;
    const percentual = total > 0 ? Math.round((atualizados / total) * 100) : 0;

    document.getElementById("area-dashboard").innerHTML = `
      <h3 style="margin-top:20px">Progresso da Atualização Cadastral</h3>
      <div class="grade-resumo">
        <div class="cartao-resumo">
          <div class="numero-resumo num">${total}</div>
          <div class="rotulo-resumo">Imóveis cadastrados</div>
        </div>
        <div class="cartao-resumo" style="cursor:pointer" id="card-atualizados">
          <div class="numero-resumo num" style="color:var(--green)">${atualizados}</div>
          <div class="rotulo-resumo">Atualizados nesta campanha</div>
        </div>
        <div class="cartao-resumo cartao-atencao" style="cursor:pointer" id="card-pendentes">
          <div class="numero-resumo num" style="color:var(--amber)">${pendentes}</div>
          <div class="rotulo-resumo">Pendentes de atualização</div>
        </div>
        <div class="cartao-resumo">
          <div class="numero-resumo num">${percentual}%</div>
          <div class="rotulo-resumo">Concluído</div>
        </div>
      </div>
      <div class="barra-progresso-container" style="margin-top:8px; max-width:480px">
        <div class="barra-progresso-preenchimento" style="width:${percentual}%"></div>
      </div>
    `;

    document.getElementById("card-atualizados")?.addEventListener("click", () => navegarPara("boletins"));
    document.getElementById("card-pendentes")?.addEventListener("click", () => navegarPara("boletins"));
  } catch (erro) {
    console.error(erro);
    document.getElementById("area-dashboard").innerHTML = `<p class="texto-secundario" style="margin-top:16px">Não foi possível calcular o resumo agora. Use o menu ao lado pra acessar os cadastros.</p>`;
  }
}

/**
 * Lê um arquivo de imagem, redimensiona no navegador (mantendo
 * proporção) e devolve como base64 — usado só pra logos pequenas
 * (unidade gestora). Fotos de imóvel usam Firebase Storage (ver
 * uploadFotoParaStorage em boletins.js), não isso — imóvel gera
 * volume grande demais pra caber em base64 dentro do documento.
 */
function redimensionarImagemParaBase64(arquivo, larguraMaxima = 300) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = (eventoLeitor) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, larguraMaxima / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Não foi possível ler essa imagem."));
      img.src = eventoLeitor.target.result;
    };
    leitor.onerror = () => reject(new Error("Não foi possível ler esse arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * Redimensiona uma foto de imóvel no navegador (evita subir fotos de
 * 5-10MB direto da câmera do celular pro Storage) e devolve um Blob
 * pronto pra upload, já em JPEG comprimido.
 */
function redimensionarImagemParaBlob(arquivo, larguraMaxima = 1600, qualidade = 0.82) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = (eventoLeitor) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, larguraMaxima / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", qualidade);
      };
      img.onerror = () => reject(new Error("Não foi possível ler essa imagem."));
      img.src = eventoLeitor.target.result;
    };
    leitor.onerror = () => reject(new Error("Não foi possível ler esse arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

// Referência de coleção da entidade atual (atalho usado pelos módulos)
function colecaoEntidade(nomeSubcolecao) {
  return db.collection("entidades").doc(estado.entidadeAtual).collection(nomeSubcolecao);
}

// -------------------------------------------------------------
// HISTÓRICO DE ALTERAÇÕES (auditoria)
// -------------------------------------------------------------
const ROTULOS_COLECAO_HISTORICO = {
  boletins: "Boletim (BCI)",
  contribuintes: "Contribuinte",
  logradouros: "Logradouro",
  bairros: "Bairro",
  quadras: "Quadra",
  setores: "Setor",
  distritos: "Distrito",
  zonas: "Zona",
  condominios: "Condomínio",
  tiposImovel: "Tipo de Imóvel",
};

async function registrarHistorico(nomeColecao, documentoId, acao, resumo) {
  try {
    await colecaoEntidade("historico").add({
      colecao: nomeColecao,
      documentoId,
      acao,
      resumo,
      usuarioEmail: estado.usuario?.email || "desconhecido",
      usuarioNome: estado.dadosUsuario?.nome || "",
      dataHora: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (erro) {
    console.warn("Não foi possível gravar o histórico desta ação:", erro);
  }
}

async function renderizarHistorico(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Histórico de Alterações</h2>
    </div>
    <div class="barra-busca">
      <select id="historico-filtro-colecao" class="filtro-ano">
        <option value="">Todos os tipos</option>
        ${Object.entries(ROTULOS_COLECAO_HISTORICO).map(([chave, rotulo]) => `<option value="${chave}">${rotulo}</option>`).join("")}
      </select>
      <select id="historico-filtro-usuario" class="filtro-ano"><option value="">Todos os usuários</option></select>
    </div>
    <div class="barra-busca">
      <div><label class="rotulo-inline">Período — de</label><input type="date" id="historico-filtro-data-de"></div>
      <div><label class="rotulo-inline">até</label><input type="date" id="historico-filtro-data-ate"></div>
      <button type="button" class="botao-secundario" id="historico-btn-limpar">Limpar filtros</button>
    </div>
    <div id="lista-registros" class="lista-cartoes"></div>
    <button id="btn-carregar-mais" class="botao-secundario oculto">Carregar mais</button>
  `;

  let paginador = criarPaginador(colecaoEntidade("historico").orderBy("dataHora", "desc"));

  db.collection("usuarios").orderBy("nomeNormalizado").get().then((snapshot) => {
    const seletor = document.getElementById("historico-filtro-usuario");
    snapshot.docs.forEach((doc) => {
      const opcao = document.createElement("option");
      opcao.value = doc.data().email;
      opcao.textContent = doc.data().nome || doc.data().email;
      seletor.appendChild(opcao);
    });
  });

  function formatarDataHora(timestamp) {
    if (!timestamp?.toDate) return "-";
    return timestamp.toDate().toLocaleString("pt-BR");
  }

  const ROTULOS_ACAO = { criar: "✅ Criou", editar: "✏️ Editou", excluir: "🗑️ Excluiu" };

  function criarCartaoHistorico(item) {
    const cartao = document.createElement("div");
    cartao.className = "cartao-registro";
    cartao.innerHTML = `
      <div>
        <strong>${ROTULOS_ACAO[item.acao] || item.acao}</strong> — ${ROTULOS_COLECAO_HISTORICO[item.colecao] || item.colecao}
        <div class="texto-secundario">${escaparHtml(item.resumo || "")}</div>
        <div class="texto-secundario">${item.usuarioNome || item.usuarioEmail} · ${formatarDataHora(item.dataHora)}</div>
      </div>
    `;
    return cartao;
  }

  async function carregarPagina(limpar = false) {
    const lista = document.getElementById("lista-registros");
    if (limpar) lista.innerHTML = "";
    try {
      const registros = await paginador.carregarProximaPagina();
      registros.forEach((item) => lista.appendChild(criarCartaoHistorico(item)));
      document.getElementById("btn-carregar-mais").classList.toggle("oculto", !paginador.temMais);
      if (limpar && registros.length === 0) {
        lista.innerHTML = `<p class="texto-secundario">Nenhuma alteração registrada ainda.</p>`;
      }
    } catch (erro) {
      tratarErroConsultaFirestore(erro);
      document.getElementById("btn-carregar-mais").classList.add("oculto");
    }
  }

  document.getElementById("btn-carregar-mais").addEventListener("click", () => carregarPagina(false));

  async function aplicarFiltrosHistorico() {
    const colecaoEscolhida = document.getElementById("historico-filtro-colecao").value;
    const usuarioEscolhido = document.getElementById("historico-filtro-usuario").value;
    const dataDe = document.getElementById("historico-filtro-data-de").value;
    const dataAte = document.getElementById("historico-filtro-data-ate").value;

    if (!dataDe && !dataAte) {
      const consultaBase = colecaoEscolhida
        ? colecaoEntidade("historico").where("colecao", "==", colecaoEscolhida).orderBy("dataHora", "desc")
        : colecaoEntidade("historico").orderBy("dataHora", "desc");
      paginador = criarPaginador(consultaBase);
      if (!usuarioEscolhido) {
        carregarPagina(true);
        return;
      }
    }

    const lista = document.getElementById("lista-registros");
    document.getElementById("btn-carregar-mais").classList.add("oculto");
    lista.innerHTML = `<p class="texto-secundario">Filtrando...</p>`;

    try {
      const snapshot = await colecaoEntidade("historico").orderBy("dataHora", "desc").limit(2000).get();
      let registros = snapshot.docs.map((doc) => doc.data());
      if (colecaoEscolhida) registros = registros.filter((r) => r.colecao === colecaoEscolhida);
      if (usuarioEscolhido) registros = registros.filter((r) => r.usuarioEmail === usuarioEscolhido);
      if (dataDe) registros = registros.filter((r) => r.dataHora?.toDate && r.dataHora.toDate() >= new Date(dataDe + "T00:00:00"));
      if (dataAte) registros = registros.filter((r) => r.dataHora?.toDate && r.dataHora.toDate() <= new Date(dataAte + "T23:59:59"));

      lista.innerHTML = "";
      registros.forEach((item) => lista.appendChild(criarCartaoHistorico(item)));
      if (registros.length === 0) lista.innerHTML = `<p class="texto-secundario">Nenhuma alteração encontrada com esses filtros.</p>`;
    } catch (erro) {
      tratarErroConsultaFirestore(erro);
    }
  }

  ["historico-filtro-colecao", "historico-filtro-usuario", "historico-filtro-data-de", "historico-filtro-data-ate"].forEach((id) => {
    document.getElementById(id).addEventListener("change", aplicarFiltrosHistorico);
  });
  document.getElementById("historico-btn-limpar").addEventListener("click", () => {
    document.getElementById("historico-filtro-colecao").value = "";
    document.getElementById("historico-filtro-usuario").value = "";
    document.getElementById("historico-filtro-data-de").value = "";
    document.getElementById("historico-filtro-data-ate").value = "";
    paginador = criarPaginador(colecaoEntidade("historico").orderBy("dataHora", "desc"));
    carregarPagina(true);
  });

  carregarPagina(true);
}

// ===================================================================
// COMBO COM BUSCA — substitui <select> simples em todo campo que
// aponta pra um cadastro vinculado (logradouro, quadra, bairro, etc.),
// permitindo digitar pra filtrar em vez de rolar uma lista longa.
// Funciona bem em celular/tablet (não depende do <datalist>, que tem
// suporte inconsistente no Safari mobile).
// ===================================================================

/** Gera o HTML do combo. `idBase` vira o prefixo dos IDs internos (idBase-texto, idBase-valor, idBase-lista). */
function htmlComboBusca(idBase, valorInicialTexto, placeholder = "Digite para buscar...") {
  return `
    <div class="combo-busca">
      <input type="text" id="${idBase}-texto" class="combo-busca-input" placeholder="${placeholder}" autocomplete="off" value="${valorInicialTexto ? escaparHtml(valorInicialTexto) : ""}">
      <input type="hidden" id="${idBase}-valor">
      <div class="combo-busca-lista oculto" id="${idBase}-lista"></div>
    </div>
  `;
}

/**
 * Ativa a busca de um combo já renderizado com htmlComboBusca.
 * `opcoes`: [{ id, nome }]. `aoSelecionar(opcao|null)` roda sempre que
 * o vínculo muda — inclusive quando o campo é limpo pelo usuário.
 */
function ativarComboBusca(idBase, opcoes, valorInicialId, aoSelecionar) {
  const campoTexto = document.getElementById(`${idBase}-texto`);
  const campoValor = document.getElementById(`${idBase}-valor`);
  const lista = document.getElementById(`${idBase}-lista`);
  if (!campoTexto) return;
  if (valorInicialId) campoValor.value = valorInicialId;

  function opcaoAtual() {
    return opcoes.find((o) => o.id === campoValor.value) || null;
  }

  function renderizarLista(termo) {
    const termoNormalizado = normalizarTexto(termo);
    const filtradas = termoNormalizado ? opcoes.filter((o) => normalizarTexto(o.nome).includes(termoNormalizado)) : opcoes;
    lista.innerHTML =
      filtradas.length === 0
        ? `<div class="combo-busca-vazio">Nenhum resultado.</div>`
        : filtradas.slice(0, 50).map((o) => `<div class="combo-busca-item" data-id="${o.id}">${escaparHtml(o.nome)}</div>`).join("");
    lista.querySelectorAll(".combo-busca-item").forEach((item) => {
      item.addEventListener("mousedown", (evento) => {
        evento.preventDefault(); // evita que o "blur" feche a lista antes do clique registrar
        const opcao = opcoes.find((o) => o.id === item.dataset.id);
        campoValor.value = opcao.id;
        campoTexto.value = opcao.nome;
        lista.classList.add("oculto");
        aoSelecionar(opcao);
      });
    });
    lista.classList.remove("oculto");
  }

  campoTexto.addEventListener("focus", () => renderizarLista(""));
  campoTexto.addEventListener("input", () => {
    if (campoTexto.value.trim() === "") {
      campoValor.value = "";
      aoSelecionar(null);
    }
    renderizarLista(campoTexto.value);
  });
  campoTexto.addEventListener("blur", () => {
    setTimeout(() => {
      lista.classList.add("oculto");
      const atual = opcaoAtual();
      // Se o texto digitado não corresponde a nenhuma opção válida do
      // cadastro, limpa — evita salvar um vínculo "fantasma" com um
      // texto que não existe de fato.
      campoTexto.value = atual ? atual.nome : "";
      if (!atual) campoValor.value = "";
    }, 150);
  });
}

// ===================================================================
// MODAL GENÉRICO (usado por todos os formulários pequenos do app —
// o Boletim em si usa página cheia, não modal, por ser grande demais)
// ===================================================================
function criarModal(titulo, corpoHtml, aoSalvar, aoExcluir = null) {
  const podeEditar = usuarioPodeEditar();
  const fundo = document.createElement("div");
  fundo.className = "fundo-modal";
  fundo.id = "fundo-modal-ativo";
  fundo.innerHTML = `
    <div class="caixa-modal">
      <div class="cabecalho-modal">
        <h3>${titulo}</h3>
        <button class="botao-fechar-modal" id="btn-fechar-modal">✕</button>
      </div>
      <div class="corpo-modal">${corpoHtml}</div>
      <div class="rodape-modal">
        ${aoExcluir && podeEditar ? `<button class="botao-perigo" id="btn-excluir-modal">🗑️ Excluir</button>` : ""}
        <div class="rodape-modal-direita">
          <button class="botao-secundario" id="btn-cancelar-modal">${podeEditar ? "Cancelar" : "Fechar"}</button>
          ${podeEditar ? `<button class="botao-primario" id="btn-salvar-modal">Salvar</button>` : ""}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(fundo);
  document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
  document.getElementById("btn-cancelar-modal").addEventListener("click", fecharModal);
  if (podeEditar) {
    document.getElementById("btn-salvar-modal").addEventListener("click", (evento) => aoSalvar(evento.target));
    if (aoExcluir) {
      document.getElementById("btn-excluir-modal").addEventListener("click", (evento) => aoExcluir(evento.target));
    }
  } else {
    fundo.querySelectorAll(".corpo-modal input, .corpo-modal select, .corpo-modal textarea").forEach((campo) => {
      campo.disabled = true;
    });
  }
  return fundo;
}

function fecharModal() {
  document.getElementById("fundo-modal-ativo")?.remove();
}
