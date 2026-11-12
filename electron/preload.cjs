const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  saveFile: (name, data, type) => ipcRenderer.invoke('save-file', { name, data, type }),
  minecraftVersions: () => ipcRenderer.invoke('minecraft-versions'),
  minecraftAssets: (version) => ipcRenderer.invoke('minecraft-assets', version),
  bakeBlenderMotion: (data, mode) => ipcRenderer.invoke('bake-blender-motion', data, mode),
});
