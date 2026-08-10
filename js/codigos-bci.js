// ===================================================================
// LISTAS DE CÓDIGOS FIXOS DO BCI (Boletim de Cadastro Imobiliário)
// ===================================================================
// Extraídas literalmente do formulário oficial em papel. Cada boletim
// grava código + nome (denormalizado), pra funcionar em relatórios e
// no PDF exportado sem precisar cruzar com nenhuma outra tabela.
const CODIGOS_BCI = {
  natureza: [
    { codigo: "00", nome: "Não informado" },
    { codigo: "15", nome: "Não construído" },
    { codigo: "23", nome: "Ruínas" },
    { codigo: "31", nome: "Em demolição" },
    { codigo: "40", nome: "Construção paralizada" },
    { codigo: "58", nome: "Construção em andamento" },
    { codigo: "74", nome: "Construído" },
  ],
  edificacao: [
    { codigo: "15", nome: "Casa" },
    { codigo: "23", nome: "Construção precária" },
    { codigo: "31", nome: "Apartamento" },
    { codigo: "58", nome: "Loja" },
    { codigo: "66", nome: "Galpão" },
    { codigo: "74", nome: "Telheiro" },
    { codigo: "86", nome: "Fábrica" },
    { codigo: "87", nome: "Especial" },
    { codigo: "99", nome: "Sem edificação" },
  ],
  estrutura: [
    { codigo: "1", nome: "Alvenaria" },
    { codigo: "2", nome: "Madeira" },
    { codigo: "3", nome: "Metálica" },
    { codigo: "4", nome: "Concreto" },
    { codigo: "5", nome: "Sem estrutura" },
  ],
  patrimonio: [
    { codigo: "12", nome: "Público" },
    { codigo: "20", nome: "Particular" },
    { codigo: "39", nome: "Religioso" },
  ],
  utilizacao: [
    { codigo: "17", nome: "Terreno sem uso" },
    { codigo: "25", nome: "Residencial" },
    { codigo: "68", nome: "Industrial" },
    { codigo: "86", nome: "Comercial/Serviço" },
    { codigo: "87", nome: "Religioso" },
  ],
  limitacao: [
    { codigo: "18", nome: "Não" },
    { codigo: "26", nome: "Sim" },
  ],
  isencaoIptu: [
    { codigo: "14", nome: "Não" },
    { codigo: "22", nome: "Imune" },
    { codigo: "30", nome: "Isento" },
  ],
  isencaoTsu: [
    { codigo: "11", nome: "Não" },
    { codigo: "20", nome: "Sim" },
  ],
  situacao: [
    { codigo: "16", nome: "Meio da quadra" },
    { codigo: "24", nome: "Esquina/mais de uma frente" },
    { codigo: "32", nome: "Vila" },
    { codigo: "59", nome: "Encravado" },
    { codigo: "67", nome: "Gleba" },
  ],
  topografia: [
    { codigo: "13", nome: "Plano" },
    { codigo: "21", nome: "Aclive" },
    { codigo: "30", nome: "Declive" },
    { codigo: "48", nome: "Irregular" },
  ],
  pedologia: [
    { codigo: "10", nome: "Inundável" },
    { codigo: "29", nome: "Firme" },
    { codigo: "37", nome: "Alagado" },
    { codigo: "86", nome: "Comunicação dos demais" },
  ],
  posicionamento: [
    { codigo: "10", nome: "Isolada" },
    { codigo: "28", nome: "Conjugada" },
    { codigo: "36", nome: "Geminada" },
    { codigo: "37", nome: "Terreno" },
  ],
  cobertura: [
    { codigo: "19", nome: "Palha/Zinco" },
    { codigo: "27", nome: "Telha de cimento/amianto" },
    { codigo: "35", nome: "Telha de barro" },
    { codigo: "43", nome: "Laje" },
    { codigo: "86", nome: "Especial" },
  ],
  forro: [
    { codigo: "17", nome: "Sem" },
    { codigo: "25", nome: "Madeira" },
    { codigo: "33", nome: "Estuque" },
    { codigo: "41", nome: "Laje" },
    { codigo: "86", nome: "Chapas" },
  ],
  paredes: [
    { codigo: "10", nome: "Sem" },
    { codigo: "28", nome: "Taipa" },
    { codigo: "36", nome: "Alvenaria" },
    { codigo: "60", nome: "Concreto" },
    { codigo: "86", nome: "Madeira" },
  ],
  fachada: [
    { codigo: "14", nome: "Sem" },
    { codigo: "30", nome: "Rebôco" },
    { codigo: "49", nome: "Material cerâmico" },
    { codigo: "59", nome: "Madeira" },
    { codigo: "86", nome: "Especial" },
  ],
  instalacaoSanitaria: [
    { codigo: "11", nome: "Sem" },
    { codigo: "20", nome: "Externa" },
    { codigo: "46", nome: "Mais de uma interna" },
    { codigo: "86", nome: "Interna simples" },
    { codigo: "87", nome: "Interna completa" },
  ],
  instalacaoEletrica: [
    { codigo: "19", nome: "Sem" },
    { codigo: "27", nome: "Aparente" },
    { codigo: "43", nome: "Embutida" },
  ],
  piso: [
    { codigo: "16", nome: "Terra batida" },
    { codigo: "24", nome: "Cimento" },
    { codigo: "32", nome: "Cerâmica/Mosaico" },
    { codigo: "87", nome: "Taco" },
    { codigo: "89", nome: "Material plástico" },
    { codigo: "90", nome: "Especial" },
  ],
  conservacao: [
    { codigo: "1", nome: "Ótima" },
    { codigo: "2", nome: "Boa" },
    { codigo: "3", nome: "Regular" },
    { codigo: "4", nome: "Mal" },
  ],
  tipoLogradouro: [
    "RUA", "AVENIDA", "TRAVESSA", "ALAMEDA", "PRAÇA", "ESTRADA", "RODOVIA", "LOTEAMENTO", "SÍTIO", "FAZENDA",
  ],
};

/** Monta as <option> de um select de código fixo, marcando a selecionada */
function montarOpcoesCodigo(lista, codigoSelecionado) {
  return (
    `<option value="">Selecione...</option>` +
    lista
      .map(
        (item) =>
          `<option value="${item.codigo}" ${item.codigo === codigoSelecionado ? "selected" : ""}>${item.codigo} - ${item.nome}</option>`
      )
      .join("")
  );
}

/** Busca o nome de um código dentro de uma lista fixa (usado ao salvar, pra denormalizar) */
function nomeDoCodigo(lista, codigo) {
  return lista.find((item) => item.codigo === codigo)?.nome || "";
}
