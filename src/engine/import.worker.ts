import { importFile } from './importers';
self.onmessage = (event) => {
  try {
    const { bytes, name, options } = event.data;
    self.postMessage({ result: importFile(new Uint8Array(bytes), name, options) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
