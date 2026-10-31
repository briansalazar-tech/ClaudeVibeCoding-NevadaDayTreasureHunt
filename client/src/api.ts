import type { Marker, MarkerInput, MarkerPatch } from '@hunt/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** The API is on the same origin by default (Vite forwards /api); VITE_API_URL points elsewhere. */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Is it running (npm run dev)?');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const MARKERS_KEY = ['markers'] as const;

export function useMarkers() {
  return useQuery({
    queryKey: MARKERS_KEY,
    queryFn: () => api<Marker[]>('/api/markers'),
  });
}

export function useSaveMarker() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: MarkerInput | MarkerPatch }) =>
      id === null
        ? api<Marker>('/api/markers', { method: 'POST', body: JSON.stringify(data) })
        : api<Marker>(`/api/markers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (saved) => {
      // Show the saved marker right away, then refetch to be sure.
      client.setQueryData<Marker[]>(MARKERS_KEY, (list = []) => [
        ...list.filter((m) => m.id !== saved.id),
        saved,
      ]);
      return client.invalidateQueries({ queryKey: MARKERS_KEY });
    },
  });
}

export function useDeleteMarker() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/markers/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: MARKERS_KEY }),
  });
}
