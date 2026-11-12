import { decodeMinecraftAssets } from './minecraft';
self.onmessage = (event) => {
  try {
    const { bytes, version, source } = event.data;
    self.postMessage({ assets: decodeMinecraftAssets(new Uint8Array(bytes), version, source) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
