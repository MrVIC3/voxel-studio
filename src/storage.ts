declare global {
  interface Window {
    desktop?: {
      saveFile: (name: string, data: Uint8Array, type: string) => Promise<boolean>;
      minecraftVersions: () => Promise<string[]>;
      minecraftAssets: (version: string) => Promise<{ version: string; bytes: Uint8Array }>;
      bakeBlenderMotion: (
        data: Uint8Array,
        mode?: 'ACTIONS' | 'NLA_TRACKS' | 'SCENE',
      ) => Promise<Uint8Array>;
    };
  }
}
export async function saveFile(name: string, data: Uint8Array, type = 'File'): Promise<boolean> {
  if (window.desktop) return window.desktop.saveFile(name, data, type);
  const a = document.createElement('a'),
    url = URL.createObjectURL(new Blob([data.slice().buffer]));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
export function readDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error('Could not read file.'));
    r.readAsDataURL(file);
  });
}
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('voxel-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recovery');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function writeRecovery(value: unknown) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('recovery', 'readwrite');
      tx.objectStore('recovery').put(value, 'project');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
export async function readRecovery(): Promise<unknown> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('recovery', 'readonly'),
        req = tx.objectStore('recovery').get('project');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    database.close();
  }
}
export async function clearRecovery(): Promise<void> {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('recovery', 'readwrite');
      tx.objectStore('recovery').delete('project');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
