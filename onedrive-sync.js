'use client';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { addPending, listPending, removePending, countPending } from './storage.js';
import { AppFolderClient, safeFolderName } from './graph.js';

const SCOPES = ['Files.ReadWrite.AppFolder'];

/**
 * Adaptador para apps web/PWA. O backup é automático enquanto o app está aberto;
 * com o app fechado o Android pode impedir tarefas em segundo plano.
 * Nunca copie tokens/segredos para logs ou arquivos.
 */
export function createOneDriveSync({ clientId, redirectUri = window.location.origin, onStatus = () => {} }) {
  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw new Error('Informe o Application (client) ID válido do registro Microsoft.');
  }
  const auth = new PublicClientApplication({
    auth: { clientId, authority: 'https://login.microsoftonline.com/consumers', redirectUri,
      postLogoutRedirectUri: redirectUri, navigateToLoginRequestUrl: false },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
  });
  let initialized = false;
  let busy = false;
  let timer = null;
  const online = () => { void syncNow(); };
  const visible = () => { if (document.visibilityState === 'visible') void syncNow(); };
  const currentAccount = () => auth.getActiveAccount() ?? auth.getAllAccounts()[0] ?? null;
  const emit = async (extra = {}) => {
    const pending = await countPending();
    onStatus({ connected: Boolean(currentAccount()), pending, syncing: busy, ...extra });
  };

  async function initialize() {
    if (initialized) return;
    await auth.initialize();
    const redirect = await auth.handleRedirectPromise();
    const account = redirect?.account ?? currentAccount();
    if (account) auth.setActiveAccount(account);
    initialized = true;
    window.addEventListener('online', online);
    window.addEventListener('focus', online);
    document.addEventListener('visibilitychange', visible);
    timer = window.setInterval(() => { if (navigator.onLine) void syncNow(); }, 60000);
    await emit();
    if (account && navigator.onLine) void syncNow();
  }

  async function connect() {
    await initialize();
    // Redirecionamento é mais consistente no Android/PWA que pop-ups.
    await auth.loginRedirect({ scopes: SCOPES });
  }

  async function getToken() {
    const account = currentAccount();
    if (!account) throw new Error('Conecte sua conta Microsoft para sincronizar.');
    const result = await auth.acquireTokenSilent({ account, scopes: SCOPES });
    return result.accessToken;
  }

  async function queueVistoria({ id, dados, anexos = [] }) {
    await initialize();
    // Recebe dados da vistoria e anexos como File/Blob; nada é apagado do app original.
    safeFolderName(id);
    if (!Array.isArray(anexos)) throw new Error('Anexos devem ser uma lista.');
    const serializedData = JSON.stringify(dados);
    if (!serializedData) throw new Error('Dados da vistoria ausentes.');
    const attachments = anexos.map((file, index) => {
      const blob = file instanceof Blob ? file : file?.blob;
      if (!(blob instanceof Blob)) throw new Error(`Anexo ${index + 1} não é um arquivo.`);
      return { blob, filename: file.name || file.filename || `anexo_${index + 1}`,
        type: blob.type || 'application/octet-stream' };
    });
    const entry = { queueId: crypto.randomUUID(), inspectionId: String(id), createdAt: new Date().toISOString(),
      serializedData, attachments };
    // Grava primeiro no IndexedDB. Falhas de internet não eliminam registros.
    await addPending(entry);
    await emit({ message: 'Vistoria adicionada à fila local.' });
    if (currentAccount() && navigator.onLine) void syncNow();
    return entry.queueId;
  }

  async function syncNow() {
    if (!initialized || busy || !navigator.onLine || !currentAccount()) return;
    busy = true;
    await emit();
    try {
      const graph = new AppFolderClient(getToken);
      const entries = await listPending();
      for (const entry of entries) {
        await graph.uploadBackup(entry);
        // A fila só remove a vistoria APÓS o manifest.json ser enviado com sucesso.
        await removePending(entry.queueId);
        await emit({ lastSyncedAt: new Date().toISOString(), message: 'Backup concluído.' });
      }
      await emit({ message: 'OneDrive atualizado.' });
    } catch (error) {
      const needsLogin = error instanceof InteractionRequiredAuthError || /interaction_required/i.test(error.message);
      await emit({ error: needsLogin ? 'Sessão expirada. Conecte novamente para continuar.' : error.message });
    } finally {
      busy = false;
      await emit();
    }
  }

  async function disconnect() {
    await initialize();
    const account = currentAccount();
    if (account) await auth.logoutRedirect({ account });
    // A fila local NÃO é apagada no logout.
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    window.removeEventListener('online', online);
    window.removeEventListener('focus', online);
    document.removeEventListener('visibilitychange', visible);
    timer = null;
  }
  return { initialize, connect, queueVistoria, syncNow, disconnect, stop, countPending };
}
