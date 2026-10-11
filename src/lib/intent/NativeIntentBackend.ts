import { invoke } from '@tauri-apps/api/core';
import type { AppendIntent, IntentBackend, IntentRecord } from './types';

export class NativeIntentBackend implements IntentBackend {
  listRecords(): Promise<IntentRecord[]> {
    return invoke('list_intent_records');
  }
  appendRecord(input: AppendIntent): Promise<IntentRecord> {
    return invoke('append_intent_record', input);
  }
}
