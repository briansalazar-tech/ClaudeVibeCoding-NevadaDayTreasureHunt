import type { Photo, PlaceRef } from '@hunt/shared';
import { useRef, useState } from 'react';
import { useCanEditFn } from '../account/context';
import { photoUrl, useDeletePhoto, usePagePhotos, useUploadPhoto } from './api';

/** A page's photos: part of the page, so added by its author or an admin. */
export function Photos({ pageId, canAdd }: { pageId: number; canAdd: boolean }) {
  const photos = usePagePhotos(pageId);
  if (!canAdd && photos.isSuccess && !photos.data.length) return null;
  return (
    <section className="nb-section" aria-labelledby="nb-photos-heading">
      <h3 id="nb-photos-heading" className="nb-section-title">
        Photos
      </h3>
      <PhotoGrid photos={photos.data ?? []} target={{ pageId }} pageEditable={canAdd} />
    </section>
  );
}

/**
 * Thumbnails (each opens full size), with "+ Photo" and remove. On a page, only someone who can
 * edit the page adds or removes them; on a map place anyone adds, and whoever added one (or an
 * admin) removes it.
 */
export function PhotoGrid({
  photos,
  target,
  compact = false,
  pageEditable = true,
}: {
  photos: readonly Photo[];
  target: { pageId: number } | { place: PlaceRef };
  compact?: boolean;
  pageEditable?: boolean;
}) {
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const canEdit = useCanEditFn();
  const input = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const onPage = 'pageId' in target;
  const canRemove = (p: Photo) => canEdit(p.createdBy) || (onPage && pageEditable);

  const add = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      await upload.mutateAsync({ file, ...target }).catch(() => undefined);
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div className={compact ? 'nb-photos compact' : 'nb-photos'}>
      {photos.length > 0 && (
        <ul className="nb-photo-grid">
          {photos.map((p) => (
            <li key={p.id}>
              <a href={photoUrl(p.id)} target="_blank" rel="noopener noreferrer">
                <img src={photoUrl(p.id)} alt={p.caption || 'Photo'} loading="lazy" />
              </a>
              {removing === p.id ? (
                <span className="nb-photo-confirm">
                  <button
                    type="button"
                    className="small-button danger"
                    onClick={() => remove.mutate(p.id, { onSettled: () => setRemoving(null) })}
                  >
                    Remove
                  </button>
                  <button type="button" className="small-button" onClick={() => setRemoving(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                canRemove(p) && (
                  <button
                    type="button"
                    className="nb-photo-remove"
                    aria-label="Remove photo"
                    onClick={() => setRemoving(p.id)}
                  >
                    ×
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {(!onPage || pageEditable) && (
        <label className="small-button nb-photo-add">
          {upload.isPending ? 'Uploading…' : '+ Photo'}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => void add(e.target.files)}
          />
        </label>
      )}
      {upload.isError && <p className="form-error">{upload.error.message}</p>}
      {remove.isError && <p className="form-error">{remove.error.message}</p>}
    </div>
  );
}
