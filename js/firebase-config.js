// ===================================================================
// CONFIGURAÇÃO DO FIREBASE
// ===================================================================
// Preencha com os dados do seu projeto: Firebase Console → Configurações
// do projeto (ícone de engrenagem) → geral → role até "Seus apps" →
// se não tiver um app da Web criado ainda, clique no ícone "</>" pra
// criar um, e copie o objeto firebaseConfig que aparecer.
const firebaseConfig = {
  apiKey: "AIzaSyCkmnNFL0yUA2AT6LVi6xp9CcHEb_8SGyY",
  authDomain: "softmais-cadastro-imobiliario.firebaseapp.com",
  projectId: "softmais-cadastro-imobiliario",
  storageBucket: "softmais-cadastro-imobiliario.firebasestorage.app",
  messagingSenderId: "324240937682",
  appId: "1:324240937682:web:c67ce132c98f6a2590530b",
};

// Inicializa o Firebase (SDK compat, mesmo padrão dos outros apps SOFT+)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Segunda instância do Firebase — usada só para criar contas de novos
// usuários sem deslogar o administrador que está criando (o Firebase Auth
// desloga automaticamente quem criou a conta se usarmos a instância
// principal; com uma instância separada isso não acontece).
const appSecundario = firebase.initializeApp(firebaseConfig, "secundario");
const authSecundario = appSecundario.auth();
