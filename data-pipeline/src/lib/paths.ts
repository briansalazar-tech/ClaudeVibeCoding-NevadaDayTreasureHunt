import path from 'node:path';

const pipelineDir = path.join(import.meta.dirname, '..', '..');

/** Downloaded source files (gitignored). */
export const RAW_DIR = path.join(pipelineDir, 'raw');
/** Processed files served by the client (committed). */
export const OUT_DIR = path.join(pipelineDir, '..', 'client', 'public', 'data');
