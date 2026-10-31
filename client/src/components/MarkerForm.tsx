import {
  LAYERS,
  MARKER_STATUSES,
  markerFeatureId,
  type LayerId,
  type Marker,
  type MarkerStatus,
} from '@hunt/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useSaveMarker } from '../api';
import { parseLatLng } from './coordinates';
import { useHuntStore } from '../state/store';

interface MarkerFormProps {
  markers: readonly Marker[];
  /** Whether a point is inside the hunt counties, for the outside-the-area warning. */
  inHuntArea: (lng: number, lat: number) => boolean;
}

export function MarkerForm({ markers, inHuntArea }: MarkerFormProps) {
  const editor = useHuntStore((s) => s.markerEditor);
  const setMarkerEditor = useHuntStore((s) => s.setMarkerEditor);
  if (editor?.mode !== 'form') return null;
  const marker =
    editor.markerId === null ? undefined : markers.find((m) => m.id === editor.markerId);
  return (
    <MarkerDialog
      key={editor.markerId ?? `new:${editor.lat}:${editor.lng}`}
      marker={marker}
      lat={editor.lat}
      lng={editor.lng}
      inHuntArea={inHuntArea}
      onClose={() => setMarkerEditor(null)}
    />
  );
}

function MarkerDialog({
  marker,
  lat,
  lng,
  inHuntArea,
  onClose,
}: {
  marker?: Marker;
  lat?: number;
  lng?: number;
  inHuntArea: (lng: number, lat: number) => boolean;
  onClose: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const save = useSaveMarker();
  const focusFeature = useHuntStore((s) => s.focusFeature);
  const [name, setName] = useState(marker?.name ?? '');
  const [description, setDescription] = useState(marker?.description ?? '');
  const [status, setStatus] = useState<MarkerStatus>(marker?.status ?? 'to-check');
  const [layer, setLayer] = useState<LayerId>(marker?.layer ?? 'custom');
  const [latText, setLatText] = useState(
    marker ? String(marker.lat) : lat !== undefined ? lat.toFixed(5) : '',
  );
  const [lngText, setLngText] = useState(
    marker ? String(marker.lng) : lng !== undefined ? lng.toFixed(5) : '',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const parsed = parseLatLng(latText, lngText);
  const outside = typeof parsed !== 'string' && !inHuntArea(parsed.lng, parsed.lat);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    setError(null);
    const data = { name, description, status, layer, lat: parsed.lat, lng: parsed.lng };
    save.mutate(
      { id: marker?.id ?? null, data },
      {
        onSuccess: (saved) => {
          onClose();
          focusFeature({
            id: markerFeatureId(saved.id),
            layer: saved.layer,
            lng: saved.lng,
            lat: saved.lat,
          });
        },
      },
    );
  };

  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby={`${id}-title`} onCancel={onClose}>
      <form onSubmit={submit} className="marker-form">
        <h2 id={`${id}-title`}>{marker ? 'Edit marker' : 'New marker'}</h2>
        <label>
          Name
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoFocus
          />
        </label>
        <label>
          Description
          <textarea
            className="text-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Status
            <select
              className="text-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as MarkerStatus)}
            >
              {MARKER_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Layer
            <select
              className="text-input"
              value={layer}
              onChange={(e) => setLayer(e.target.value as LayerId)}
            >
              {LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Latitude
            <input
              className="text-input"
              inputMode="decimal"
              value={latText}
              onChange={(e) => setLatText(e.target.value)}
              placeholder="39.38095"
            />
          </label>
          <label>
            Longitude
            <input
              className="text-input"
              inputMode="decimal"
              value={lngText}
              onChange={(e) => setLngText(e.target.value)}
              placeholder="-119.64143"
            />
          </label>
        </div>
        {typeof parsed !== 'string' && parsed.swapped && (
          <p className="form-note">
            Latitude and longitude look swapped; they’ll be saved as {parsed.lat}, {parsed.lng}.
          </p>
        )}
        {outside && <p className="form-note warning">That spot is outside the hunt counties.</p>}
        {(error ?? save.error?.message) && (
          <p className="form-error">{error ?? save.error?.message}</p>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save marker'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** The "Add marker" button on the map, and the banner shown while picking a spot. */
export function AddMarkerControl() {
  const editor = useHuntStore((s) => s.markerEditor);
  const setMarkerEditor = useHuntStore((s) => s.setMarkerEditor);
  if (editor?.mode === 'placing') {
    return (
      <div className="placing-banner" role="status">
        <span>Click the map where the marker goes.</span>
        <button
          type="button"
          className="small-button"
          onClick={() => setMarkerEditor({ mode: 'form', markerId: null })}
        >
          Enter coordinates
        </button>
        <button type="button" className="small-button" onClick={() => setMarkerEditor(null)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="add-marker-button"
      onClick={() => setMarkerEditor({ mode: 'placing' })}
    >
      + Marker
    </button>
  );
}
