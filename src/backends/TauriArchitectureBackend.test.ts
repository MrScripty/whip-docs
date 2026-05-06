import assert from 'node:assert/strict';
import test from 'node:test';

import { TauriArchitectureBackend } from './TauriArchitectureBackend.ts';

test('TauriArchitectureBackend rejects commands outside the Tauri runtime', async () => {
  const backend = new TauriArchitectureBackend();

  assert.equal(backend.isAvailable(), false);
  await assert.rejects(backend.getAppStatus(), {
    code: 'tauri_unavailable',
    recoverable: true,
  });
});
