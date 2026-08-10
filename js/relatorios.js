// ===================================================================
// RELATÓRIOS E PROGRESSO DA ATUALIZAÇÃO CADASTRAL
// ===================================================================
// Os totais são sempre calculados com contagem no servidor
// (getCountFromServer/count()), nunca baixando os boletins inteiros só
// pra somar no cliente. Como o Firestore não tem "GROUP BY" nativo, o
// detalhamento por bairro roda uma consulta de contagem por bairro —
// aceitável porque a lista de bairros é pequena e limitada (dezenas,
// não milhares), diferente da lista de boletins em si.

async function contarComFallback(consulta) {
  try {
    if (consulta.count) {
      const resultado = await consulta.count().get();
      return resultado.data().count;
    }
  } catch (erro) {
    console.warn("Agregação count() falhou, usando contagem manual como respaldo:", erro);
  }
  // Fallback manual: só entra aqui se a agregação no servidor falhar
  // por algum motivo (ex: SDK antigo) — mais lento, mas nunca trava a tela.
  const snapshot = await consulta.get();
  return snapshot.size;
}

async function renderizarRelatorios(area) {
  area.innerHTML = `
    <div class="cabecalho-pagina">
      <h2>Relatórios e Progresso</h2>
      <button class="botao-secundario" id="btn-exportar-csv">⬇️ Exportar CSV</button>
    </div>
    <div id="area-resumo-geral"><p class="texto-secundario">Calculando...</p></div>
    <h3 style="margin-top:24px">Progresso por Bairro</h3>
    <div id="area-tabela-bairros"><p class="texto-secundario">Calculando...</p></div>
  `;

  const [total, atualizados, pendentes, bairros] = await Promise.all([
    contarComFallback(colecaoEntidade("boletins")),
    contarComFallback(colecaoEntidade("boletins").where("statusAtualizacao", "==", "atualizado")),
    contarComFallback(colecaoEntidade("boletins").where("statusAtualizacao", "==", "pendente")),
    carregarListaCompleta("bairros"),
  ]);
  const percentual = total > 0 ? Math.round((atualizados / total) * 100) : 0;

  document.getElementById("area-resumo-geral").innerHTML = `
    <div class="grade-resumo">
      <div class="cartao-resumo"><div class="numero-resumo num">${total}</div><div class="rotulo-resumo">Total de Boletins</div></div>
      <div class="cartao-resumo"><div class="numero-resumo num" style="color:var(--green)">${atualizados}</div><div class="rotulo-resumo">Atualizados</div></div>
      <div class="cartao-resumo"><div class="numero-resumo num" style="color:var(--amber)">${pendentes}</div><div class="rotulo-resumo">Pendentes</div></div>
      <div class="cartao-resumo"><div class="numero-resumo num">${percentual}%</div><div class="rotulo-resumo">Concluído</div></div>
    </div>
  `;

  const areaTabela = document.getElementById("area-tabela-bairros");
  if (bairros.length === 0) {
    areaTabela.innerHTML = `<p class="texto-secundario">Nenhum bairro cadastrado ainda.</p>`;
    return;
  }

  const linhas = [];
  for (const bairro of bairros) {
    const [totalBairro, atualizadosBairro] = await Promise.all([
      contarComFallback(colecaoEntidade("boletins").where("bairroId", "==", bairro.id)),
      contarComFallback(colecaoEntidade("boletins").where("bairroId", "==", bairro.id).where("statusAtualizacao", "==", "atualizado")),
    ]);
    if (totalBairro === 0) continue;
    linhas.push({
      bairro: bairro.nome,
      total: totalBairro,
      atualizados: atualizadosBairro,
      pendentes: totalBairro - atualizadosBairro,
      percentual: Math.round((atualizadosBairro / totalBairro) * 100),
    });
  }

  if (linhas.length === 0) {
    areaTabela.innerHTML = `<p class="texto-secundario">Nenhum boletim vinculado a bairro ainda.</p>`;
    return;
  }

  areaTabela.innerHTML = `
    <table class="tabela-relatorio">
      <thead><tr><th>Bairro</th><th>Total</th><th>Atualizados</th><th>Pendentes</th><th>% Concluído</th></tr></thead>
      <tbody>
        ${linhas
          .map(
            (l) => `
          <tr>
            <td>${escaparHtml(l.bairro)}</td>
            <td class="num">${l.total}</td>
            <td class="num" style="color:var(--green)">${l.atualizados}</td>
            <td class="num" style="color:var(--amber)">${l.pendentes}</td>
            <td class="num">${l.percentual}%</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  document.getElementById("btn-exportar-csv").addEventListener("click", () => {
    const cabecalho = "Bairro;Total;Atualizados;Pendentes;Percentual Concluido\n";
    const corpo = linhas.map((l) => `${l.bairro};${l.total};${l.atualizados};${l.pendentes};${l.percentual}%`).join("\n");
    const blob = new Blob(["\uFEFF" + cabecalho + corpo], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `progresso-cadastral-${dataLocalISO()}.csv`;
    link.click();
  });
}
