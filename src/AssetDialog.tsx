import { useRef } from 'react';
import { Modal } from './components';
import type { MinecraftAssets } from './engine/minecraft';
export function AssetDialog({
  assets,
  versions,
  loading,
  error,
  missing,
  onVersion,
  onArchive,
  onClose,
}: {
  assets: MinecraftAssets | null;
  versions: string[];
  loading: boolean;
  error: string;
  missing: string[];
  onVersion: (v: string) => void;
  onArchive: (file: File) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Modal
      title="Minecraft Resources"
      subtitle="Original game textures and model definitions."
      onClose={onClose}
    >
      <div className="modal-body">
        <label className="select-row">
          Installed Java version
          <select
            aria-label="Minecraft version"
            disabled={loading}
            value={assets?.version || ''}
            onChange={(e) => onVersion(e.target.value)}
          >
            <option value="" disabled>
              Select installed version
            </option>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {assets && (
          <dl className="resource-stats">
            <dt>Source</dt>
            <dd>{assets.source}</dd>
            <dt>Textures</dt>
            <dd>{Object.keys(assets.textures).length.toLocaleString()}</dd>
            <dt>Block models</dt>
            <dd>{Object.keys(assets.models).length.toLocaleString()}</dd>
            <dt>Block states</dt>
            <dd>{Object.keys(assets.blockstates).length.toLocaleString()}</dd>
          </dl>
        )}
        <p className="hint">
          Textures are read directly from your local Java installation. The application does not
          recolor or synthesize the image pixels. Biome-colored faces use the default plains tint.
          Version-specific blocks require the matching version's assets.
        </p>
        {missing.length > 0 && (
          <details className="hint">
            <summary>{missing.length} missing resources encountered</summary>
            <p>
              {missing.slice(0, 30).join(', ')}
              {missing.length > 30 ? '…' : ''}
            </p>
          </details>
        )}
        <input
          ref={input}
          type="file"
          accept=".jar,.zip"
          hidden
          aria-label="Minecraft resources archive"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onArchive(file);
          }}
        />
        <button className="button full" disabled={loading} onClick={() => input.current?.click()}>
          Load Java version JAR or resource pack…
        </button>
        {loading && <p className="hint">Reading resources…</p>}
        {error && <p className="error-message">{error}</p>}
      </div>
      <footer>
        <button className="button" onClick={onClose}>
          Close
        </button>
      </footer>
    </Modal>
  );
}
