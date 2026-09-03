import type { AssessmentRecord, TaskType } from '@/types/assessment';
import type { SnapshotSet } from '@/lib/stores/assessmentStore';
import type { DerivedRow } from './derivedValues';

/**
 * Self-contained saved session: everything the results view and the
 * exports need, with no dependency on the original scan files. Written
 * by "Save Session File" and by the automatic browser-storage backup.
 */
export interface SessionFile {
  format: 'recompose-session';
  version: 1;
  savedAt: string;
  record: AssessmentRecord;
  derived: DerivedRow[];
  snapshotSets: Partial<Record<TaskType, SnapshotSet>>;
}

const STORAGE_KEY = 'recompose.session.v1';

export function buildSessionFile(
  record: AssessmentRecord,
  derived: DerivedRow[],
  snapshotSets: Partial<Record<TaskType, SnapshotSet>>,
): SessionFile {
  return {
    format: 'recompose-session',
    version: 1,
    savedAt: new Date().toISOString(),
    record,
    derived,
    snapshotSets,
  };
}

/** Base name for export files: participant ID first, then scan ID. */
export function sessionBaseName(record: AssessmentRecord): string {
  return (record.participantId || record.scanId || record.id.slice(0, 8))
    .replace(/[^\w.-]+/g, '_');
}

/**
 * Persist to browser storage so a refresh can't destroy a completed
 * assessment. Snapshots are large; on quota failure retry without them.
 */
export function saveSessionToBrowser(file: SessionFile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...file, snapshotSets: {} }),
      );
    } catch {
      // storage unavailable — nothing more to do
    }
  }
}

export function loadSessionFromBrowser(): SessionFile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseSessionFile(raw);
  } catch {
    return null;
  }
}

export function clearBrowserSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Validate and parse a session file's JSON text. Null when invalid. */
export function parseSessionFile(text: string): SessionFile | null {
  try {
    const data = JSON.parse(text);
    if (
      data?.format !== 'recompose-session' ||
      data?.version !== 1 ||
      !data?.record?.id ||
      !data?.record?.scores ||
      !Array.isArray(data?.record?.selectedTasks)
    ) {
      return null;
    }
    return {
      format: 'recompose-session',
      version: 1,
      savedAt: data.savedAt ?? new Date().toISOString(),
      record: data.record,
      derived: Array.isArray(data.derived) ? data.derived : [],
      snapshotSets: data.snapshotSets ?? {},
    };
  } catch {
    return null;
  }
}
