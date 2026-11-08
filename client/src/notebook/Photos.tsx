import type { Photo, PlaceRef } from '@hunt/shared';
import { useRef, useState } from 'react';
import { photoUrl, useDeletePhoto, usePagePhotos, useUploadPhoto } from './api';

/** A page's photos. */
export function Photos({ pageId }: { pageId: number }) {
  const photos = usePagePhotos(pageId);
  return (
    <section className="nb-section" aria-labelledby="nb-photos-heading">
      <h3 id="nb-photos-heading" className="nb-section-title">
        Photos
      </h3>
      <PhotoGrid photos={photos.data ?? []} target={{ pageId }} />
    </section>
  );
}

/** Thumbnails (each opens full size), with "+ Photo" and remove. */
export function PhotoGrid({
  photos,
  target,
  compact = false,
}: {
  photos: readonly Photo[];
  target: { pageId: number } | { place: PlaceRef };
  compact?: boolean;
}) {
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const input = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<number | null>(null);

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
                <button
                  type="button"
                  className="nb-photo-remove"
                  aria-label="Remove photo"
                  onClick={() => setRemoving(p.id)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
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
      {upload.isError && <p className="form-error">{upload.error.message}</p>}
    </div>
  );
}
