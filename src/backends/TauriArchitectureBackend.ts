import { invoke } from '@tauri-apps/api/core';

export type AppStatusDto = {
  appName: string;
  activeProduct: string;
  shutdownRequested: boolean;
};

export type SourceRepoStatusDto =
  | 'unconfigured'
  | 'valid'
  | 'missing'
  | 'not_directory'
  | 'missing_cargo_manifest'
  | 'invalid_path';

export type AppConfigDto = {
  schemaVersion: number;
  sourceRepoPath: string | null;
  sourceRepoStatus: SourceRepoStatusDto;
};

export type CommandErrorDto = {
  code: string;
  message: string;
  recoverable: boolean;
};

export class TauriArchitectureBackend {
  async getAppStatus(): Promise<AppStatusDto> {
    return invoke<AppStatusDto>('get_app_status');
  }

  async getAppConfig(): Promise<AppConfigDto> {
    return invoke<AppConfigDto>('get_app_config');
  }

  async setSourceRepoPath(path: string): Promise<AppConfigDto> {
    return invoke<AppConfigDto>('set_source_repo_path', { path });
  }
}
