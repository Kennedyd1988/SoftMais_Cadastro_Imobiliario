// Estratégia "network-first": sempre tenta buscar a versão mais nova
// primeiro; só usa o cache como fallback se estiver sem internet.
// Isso evita o problema clássico de PWA "preso" numa versão antiga
// depois de uma atualização — sempre que publicar um arquivo .js ou
// .css novo, aumente o número da versão abaixo (v1 -> v2 -> ...).

const NOME_CACHE = "soft-cadastro-imobiliario-v8";
const ARQUIVOS_ESSENCIAIS = [
  "./index.html",
  "./css/estilos.css?v=8",
  "./manifest.json",
  "./logo-horizontal.png",
  "./logo-simbolo.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves.filter((chave) => chave !== NOME_CACHE).map((chave) => caches.delete(chave))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;

  // Nunca cachear chamadas às APIs do Google (Firestore, Auth, Storage) —
  // deixar sempre passar direto pra rede, nunca servir dado dinâmico velho.
  if (evento.request.url.includes("googleapis.com") || evento.request.url.includes("google.com") || evento.request.url.includes("firebasestorage.app")) {
    return;
  }

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(NOME_CACHE).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});
