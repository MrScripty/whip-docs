import type {
  AppConfigDto,
  CommandErrorDto,
} from '../../backends/TauriArchitectureBackend';
import { TauriArchitectureBackend } from '../../backends/TauriArchitectureBackend.ts';

export class ArchitectureService {
  private readonly backend: TauriArchitectureBackend;

  constructor(backend = new TauriArchitectureBackend()) {
    this.backend = backend;
  }

  getConfig(): Promise<AppConfigDto> {
    return this.backend.getAppConfig();
  }

  setSourceRepoPath(path: string): Promise<AppConfigDto> {
    return this.backend.setSourceRepoPath(path.trim());
  }
}

export function commandErrorMessage(error: unknown): string {
  if (isCommandErrorDto(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed';
}

function isCommandErrorDto(error: unknown): error is CommandErrorDto {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;
  return (
    typeof record.code === 'string' &&
    typeof record.message === 'string' &&
    typeof record.recoverable === 'boolean'
  );
}
