import { openDB, IDBPDatabase } from 'idb';

export interface OfflineAttendancePayload {
  id: string; // `${classId}:${date}`
  classId: string;
  className: string;
  date: string;
  entries: Array<{
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE';
    notes?: string;
  }>;
  queuedAt: number;
}

const DB_NAME = 'stayinschool-offline';
const STORE_NAME = 'attendanceQueue';

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

export async function queueOfflineAttendance(
  payload: Omit<OfflineAttendancePayload, 'id' | 'queuedAt'>
): Promise<OfflineAttendancePayload> {
  const db = await getDb();
  const record: OfflineAttendancePayload = {
    ...payload,
    id: `${payload.classId}:${payload.date}`,
    queuedAt: Date.now(),
  };
  await db.put(STORE_NAME, record);
  return record;
}

export async function getQueuedAttendance(): Promise<OfflineAttendancePayload[]> {
  if (typeof window === 'undefined') return [];
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function removeQueuedAttendance(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function syncQueuedAttendance(): Promise<{
  syncedCount: number;
  failedCount: number;
}> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { syncedCount: 0, failedCount: 0 };
  }

  const queued = await getQueuedAttendance();
  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queued) {
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: item.classId,
          date: item.date,
          syncedFromOffline: true,
          entries: item.entries,
        }),
      });
      if (res.ok) {
        await removeQueuedAttendance(item.id);
        syncedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }

  return { syncedCount, failedCount };
}
