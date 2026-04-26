import assert from 'node:assert/strict';
import test from 'node:test';

import { commandErrorMessage } from './ArchitectureService.ts';

test('commandErrorMessage preserves backend validation message', () => {
  const message = commandErrorMessage({
    code: 'validation_error',
    message: 'source repository path cannot contain parent traversal',
    recoverable: true,
  });

  assert.equal(message, 'source repository path cannot contain parent traversal');
});

test('commandErrorMessage handles unknown transport failure', () => {
  assert.equal(commandErrorMessage({}), 'Request failed');
});

