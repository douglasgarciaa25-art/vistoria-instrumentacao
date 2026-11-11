/** Cliente de dados Microsoft Graph para a pasta privada do aplicativo. */
const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX_SMALL_UPLOAD = 250 * 1024 * 1024;

export function safeFolderName(value) {
  const name = String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 65);
  if (!name) throw new Error('Identificador da vistoria inválido.');
  return name;
}
export function safeFileName(value) {
  const text = String(value ?? '').split(/[\\/]/).pop().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  let name = text.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 100);
  if (!name || name === '.' || name === '..') name = 'anexo';
  return name;
}
export function revisionFolderName(entry) {
  return `${entry.createdAt.replace(/[:.]/g, '-')}_${safeFolderName(entry.queueId)}`;
}

export class GraphHttpError extends Error {
  constructor(status, detail, retryAfter) {
    super(`Microsoft Graph HTTP ${status}: ${detail}`);
    this.name = 'GraphHttpError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pathForId = id => encodeURIComponent(id);

export class AppFolderClient {
  constructor(getAccessToken, fetchImplementation = fetch) {
    this.getAccessToken = getAccessToken;
    this.fetchImplementation = fetchImplementation;
  }

  async request(path, { method = 'GET', body, contentType } = {}) {
    const target = new URL(path.startsWith('/') ? `${GRAPH}${path}` : path);
    if (target.origin !== 'https://graph.microsoft.com' || !target.pathname.startsWith('/v1.0/')) {
      throw new Error('Endereço Graph inesperado: solicitação bloqueada.');
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const headers = { Authorization: `Bearer ${await this.getAccessToken()}` };
      if (contentType) headers['Content-Type'] = contentType;
      const response = await this.fetchImplementation(target.href, { method, headers, body, redirect: 'follow' });
      if (response.ok) {
        if (response.status === 204) return null;
        return response.json();
      }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        const secs = Number(response.headers.get('Retry-After'));
        await sleep(Number.isFinite(secs) && secs > 0 ? Math.min(secs, 30) * 1000 : (attempt + 1) * 1000);
        continue;
      }
      let detail = response.statusText;
      try { const data = await response.json(); detail = data?.error?.message ?? detail; } catch { /* erro sem JSON */ }
      throw new GraphHttpError(response.status, detail, response.headers.get('Retry-After'));
    }
    throw new Error('Falha de comunicação com Microsoft Graph.');
  }

  async getAppFolder() {
    const folder = await this.request('/me/drive/special/approot');
    if (!folder?.id) throw new Error('Pasta do aplicativo não encontrada no OneDrive.');
    return folder;
  }

  async listChildren(parentId) {
    let next = `/me/drive/items/${pathForId(parentId)}/children?$select=id,name,folder,file,webUrl&$top=200`;
    const items = [];
    while (next) {
      const page = await this.request(next);
      items.push(...(page.value ?? []));
      next = page['@odata.nextLink'] || null;
    }
    return items;
  }

  async ensureFolder(parentId, name) {
    const current = (await this.listChildren(parentId)).find(item => item.name === name);
    if (current) {
      if (!current.folder) throw new Error(`Há um arquivo chamado ${name} impedindo a criação da pasta.`);
      return current;
    }
    try {
      return await this.request(`/me/drive/items/${pathForId(parentId)}/children`, {
        method: 'POST', contentType: 'application/json',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
      });
    } catch (err) {
      if (err.status === 409) {
        const found = (await this.listChildren(parentId)).find(item => item.name === name && item.folder);
        if (found) return found;
      }
      throw err;
    }
  }

  async uploadFile(parentId, filename, payload, contentType) {
    const blob = payload instanceof Blob ? payload : new Blob([payload], { type: contentType });
    if (blob.size > MAX_SMALL_UPLOAD) {
      throw new Error(`Arquivo ${filename} maior que 250 MB; requer upload em partes.`);
    }
    return this.request(`/me/drive/items/${pathForId(parentId)}:/${encodeURIComponent(filename)}:/content`, {
      method: 'PUT', body: blob, contentType: blob.type || contentType || 'application/octet-stream'
    });
  }

  /** Somente quando manifest.json foi salvo a revisão é considerada concluída. */
  async uploadBackup(entry) {
    const root = await this.getAppFolder();
    const main = await this.ensureFolder(root.id, 'Vistorias');
    const inspection = await this.ensureFolder(main.id, safeFolderName(entry.inspectionId));
    const revision = await this.ensureFolder(inspection.id, revisionFolderName(entry));
    const data = {
      schema: 1, inspectionId: entry.inspectionId, createdAt: entry.createdAt,
      queueId: entry.queueId, data: JSON.parse(entry.serializedData)
    };
    await this.uploadFile(revision.id, 'vistoria.json', JSON.stringify(data, null, 2), 'application/json');
    const files = [];
    for (const [index, attachment] of entry.attachments.entries()) {
      const filename = `${String(index + 1).padStart(2, '0')}_${safeFileName(attachment.filename)}`;
      await this.uploadFile(revision.id, filename, attachment.blob, attachment.type);
      files.push({ filename, bytes: attachment.blob.size, type: attachment.type });
    }
    await this.uploadFile(revision.id, 'manifest.json', JSON.stringify({
      schema: 1, completed: true, inspectionId: entry.inspectionId,
      queueId: entry.queueId, createdAt: entry.createdAt,
      files: [{ filename: 'vistoria.json', type: 'application/json' }, ...files]
    }, null, 2), 'application/json');
    return { folderId: revision.id, webUrl: revision.webUrl };
  }
}
