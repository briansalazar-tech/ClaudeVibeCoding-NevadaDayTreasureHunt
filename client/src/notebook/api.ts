import type {
  NoteInput,
  OpenPage,
  Page,
  PageInput,
  PagePatch,
  PageReferences,
  Photo,
  PlaceNote,
  PlaceNotebook,
  PlaceRef,
  RenameResult,
  SourceKind,
} from '@hunt/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { API_BASE, ApiError, api } from '../api';

/** TanStack Query hooks for the notebook: pages, notes on places, photos, backup. */

const PAGES = ['pages'] as const;
const NOTES = ['notes'] as const;

/**
 * Notebook data is all linked (a rename rewrites notes and markers; a note changes a place's
 * "In your notebook"), so a change refreshes all of it. It's one user's data: cheap to refetch.
 */
function refreshNotebook(client: QueryClient) {
  return Promise.all(
    [PAGES, NOTES, ['page-refs'], ['place-notebook'], ['photos'], ['markers']].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export function usePages() {
  return useQuery({ queryKey: PAGES, queryFn: () => api<Page[]>('/api/pages') });
}

export function usePageReferences(id: number) {
  return useQuery({
    queryKey: ['page-refs', id],
    queryFn: () => api<PageReferences>(`/api/pages/${id}/references`),
  });
}

/** Adds or replaces a page in the cached list, so it shows before the refetch. */
function cachePage(client: QueryClient, page: Page) {
  client.setQueryData<Page[]>(PAGES, (list = []) => [
    ...list.filter((p) => p.id !== page.id),
    page,
  ]);
}

export function useCreatePage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PageInput) => api<Page>('/api/pages', json('POST', input)),
    onSuccess: (page) => {
      cachePage(client, page);
      return refreshNotebook(client);
    },
  });
}

/** The page by that name, created if there's none: a link clicked, "Today", a place's page. */
export function useOpenPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenPage) => api<Page>('/api/pages/open', json('POST', input)),
    onSuccess: (page) => {
      cachePage(client, page);
      return refreshNotebook(client);
    },
  });
}

export function useSavePage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: PagePatch }) =>
      api<RenameResult>(`/api/pages/${id}`, json('PATCH', patch)),
    onSuccess: ({ page }) => {
      cachePage(client, page);
      return refreshNotebook(client);
    },
  });
}

export function useDeletePage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/pages/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      client.setQueryData<Page[]>(PAGES, (list = []) => list.filter((p) => p.id !== id));
      return refreshNotebook(client);
    },
  });
}

/** Links the plain mentions of a page title in one page, note or marker. */
export function useLinkMentions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: SourceKind; id: number; title: string }) =>
      api<{ linked: number }>('/api/references/link', json('POST', input)),
    onSuccess: () => refreshNotebook(client),
  });
}

/** After a capture: links the chosen names in the page's text. */
export function useLinkNames() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, names }: { id: number; names: string[] }) =>
      api<{ page: Page; linked: number }>(`/api/pages/${id}/link-names`, json('POST', { names })),
    onSuccess: () => refreshNotebook(client),
  });
}

export function useNotes() {
  return useQuery({ queryKey: NOTES, queryFn: () => api<PlaceNote[]>('/api/notes') });
}

export function useSaveNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: NoteInput }) =>
      id === null
        ? api<PlaceNote>('/api/notes', json('POST', input))
        : api<PlaceNote>(`/api/notes/${id}`, json('PATCH', { body: input.body })),
    onSuccess: () => refreshNotebook(client),
  });
}

export function useDeleteNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => refreshNotebook(client),
  });
}

export function usePlaceNotebook(place: PlaceRef) {
  return useQuery({
    queryKey: ['place-notebook', place.id, place.name],
    queryFn: () =>
      api<PlaceNotebook>(
        `/api/places/notebook?${new URLSearchParams({ id: place.id, name: place.name }).toString()}`,
      ),
  });
}

export function usePagePhotos(pageId: number) {
  return useQuery({
    queryKey: ['photos', pageId],
    queryFn: () => api<Photo[]>(`/api/photos?pageId=${pageId}`),
  });
}

export function photoUrl(id: number): string {
  return `${API_BASE}/api/photos/${id}/file`;
}

/** Phone photos are several MB; a 2048 px JPEG is plenty to look at and keeps backups small. */
async function shrink(file: File): Promise<Blob> {
  const MAX = 2048;
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function useUploadPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      pageId,
      place,
    }: {
      file: File;
      pageId?: number;
      place?: PlaceRef;
    }) => {
      const body = await shrink(file);
      const query = new URLSearchParams(
        pageId ? { pageId: String(pageId) } : { place: JSON.stringify(place) },
      );
      const res = await fetch(`${API_BASE}/api/photos?${query.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': body.type || file.type },
        body,
      }).catch(() => {
        throw new ApiError(0, 'Can’t reach the server. Is it running (npm run dev)?');
      });
      const data = (await res.json().catch(() => ({}))) as Photo & { error?: string };
      if (!res.ok) throw new ApiError(res.status, data.error ?? `Upload failed (${res.status})`);
      return data;
    },
    onSuccess: () => refreshNotebook(client),
  });
}

export function useDeletePhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/photos/${id}`, { method: 'DELETE' }),
    onSuccess: () => refreshNotebook(client),
  });
}

/** Restores a JSON backup, replacing everything (the server keeps a copy of what was there). */
export function useRestore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      return api<{ restored: Record<string, number>; photos: number; previous: string | null }>(
        '/api/restore',
        { method: 'POST', body: text },
      );
    },
    onSuccess: () => client.invalidateQueries(),
  });
}

export const EXPORT_URL = `${API_BASE}/api/export/notebook.md`;
export const BACKUP_URL = `${API_BASE}/api/backup`;
