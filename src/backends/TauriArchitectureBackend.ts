import { invoke } from '@tauri-apps/api/core';

export type AppStatusDto = {
  appName: string;
  activeProduct: string;
  shutdownRequested: boolean;
};

export class TauriArchitectureBackend {
  async getAppStatus(): Promise<AppStatusDto> {
    return invoke<AppStatusDto>('get_app_status');
  }
}

