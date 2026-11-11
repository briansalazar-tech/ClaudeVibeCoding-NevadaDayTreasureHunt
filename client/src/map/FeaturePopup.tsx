import {
  formatDms,
  kindLabel,
  landKindName,
  layerName,
  markerFeatureId,
  statusName,
  type CountyId,
  type Manifest,
  type Marker,
  type PlaceProperties,
} from '@hunt/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuthorName, useCanEdit } from '../account/context';
import { useDeleteMarker } from '../api';
import { landOwnerAt } from '../layerData';
import { Inline } from '../notebook/Markdown';
import { PagePopup, PlaceNotebookSection } from '../notebook/PlaceNotebook';
import { useHuntStore, type PointPin } from '../state/store';

export type PopupTarget =
  | { type: 'place'; props: PlaceProperties; lng: number; lat: number }
  | { type: 'marker'; marker: Marker; county: CountyId | null }
  | { type: 'point'; pin: PointPin; county: CountyId | null }
  | { type: 'page'; pageId: number; lng: number; lat: number };

function formatCoord(n: number): string {
  return n.toFixed(5);
}

function Coordinates({ lat, lng, dms = false }: { lat: number; lng: number; dms?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = `${formatCoord(lat)}, ${formatCoord(lng)}`;
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="popup-coords">
      <code>{text}</code>
      <button type="button" className="small-button" onClick={copy} aria-label="Copy coordinates">
        {copied ? 'Copied' : 'Copy'}
      </button>
      {dms && (
        <code className="popup-dms">
          {formatDms(lat, 'lat')} {formatDms(lng, 'lng')}
        </code>
      )}
    </div>
  );
}

function LandOwner({
  manifest,
  county,
  lat,
  lng,
}: {
  manifest: Manifest;
  county: CountyId | null;
  lat: number;
  lng: number;
}) {
  const client = useQueryClient();
  const hasLand = county !== null && (manifest.counties[county]?.layers.land?.count ?? 0) > 0;
  const owner = useQuery({
    queryKey: ['land-owner', county, lat.toFixed(5), lng.toFixed(5)],
    queryFn: () => landOwnerAt(client, manifest, county!, lng, lat),
    enabled: hasLand,
    staleTime: Infinity,
  });
  if (!hasLand) return null;
  return (
    <p className="popup-owner">
      <span className="popup-label">Land owner</span>{' '}
      {owner.isPending ? 'Looking up…' : owner.isError ? 'Unavailable' : (owner.data ?? 'Unknown')}
    </p>
  );
}

function Links({ lat, lng, props }: { lat: number; lng: number; props?: PlaceProperties }) {
  const at = `${lat},${lng}`;
  const links = [
    props?.hmdb && { href: props.hmdb, label: 'HMdb' },
    props?.shpo && { href: props.shpo, label: 'State marker page' },
    props?.wikipedia && { href: props.wikipedia, label: 'Wikipedia' },
    props?.website && { href: props.website, label: 'Website' },
    {
      href: `https://www.google.com/maps/@?api=1&map_action=map&center=${at}&zoom=18&basemap=satellite`,
      label: 'Satellite view',
    },
    { href: `https://www.google.com/maps/dir/?api=1&destination=${at}`, label: 'Directions' },
  ].filter((l): l is { href: string; label: string } => Boolean(l));
  return (
    <ul className="popup-links">
      {links.map((l) => (
        <li key={l.label}>
          <a href={l.href} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function FeaturePopup({ target, manifest }: { target: PopupTarget; manifest: Manifest }) {
  if (target.type === 'marker')
    return <MarkerPopup marker={target.marker} county={target.county} manifest={manifest} />;
  if (target.type === 'point')
    return <PointPopup pin={target.pin} county={target.county} manifest={manifest} />;
  if (target.type === 'page') return <PagePopup pageId={target.pageId} />;
  const { props, lat, lng } = target;
  const kind = props.layer === 'land' ? landKindName(props.kind) : kindLabel(props.kind);
  const surface =
    props.surface && props.surface !== 'unknown' ? `${props.surface} surface` : undefined;
  return (
    <div className="popup">
      <h3>{props.name}</h3>
      <p className="popup-sub">
        {layerName(props.layer)}
        {kind && kind !== layerName(props.layer) ? ` · ${kind}` : ''}
      </p>
      {(props.detail || props.ref || surface) && (
        <p className="popup-detail">
          {[props.ref && props.ref !== props.name ? props.ref : '', surface, props.detail]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <Coordinates lat={lat} lng={lng} />
      <LandOwner manifest={manifest} county={props.county as CountyId} lat={lat} lng={lng} />
      <Links lat={lat} lng={lng} props={props} />
      {/* Notes and pages go on named places, at their representative point, not the click. */}
      {props.layer !== 'land' && props.named && (
        <PlaceNotebookSection
          place={{
            id: props.id,
            layer: props.layer,
            name: props.name,
            lng: props.lng ?? lng,
            lat: props.lat ?? lat,
          }}
        />
      )}
      <p className="popup-source">Source: {props.source}</p>
    </div>
  );
}

function MarkerPopup({
  marker,
  county,
  manifest,
}: {
  marker: Marker;
  county: CountyId | null;
  manifest: Manifest;
}) {
  const setMarkerEditor = useHuntStore((s) => s.setMarkerEditor);
  const remove = useDeleteMarker();
  const canEdit = useCanEdit(marker.createdBy);
  const author = useAuthorName(marker.createdBy);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="popup">
      <h3>{marker.name}</h3>
      <p className="popup-sub">
        Custom marker · {layerName(marker.layer)}
        {author && ` · added by ${author}`}
      </p>
      <p>
        <span className={`status-badge status-${marker.status}`}>{statusName(marker.status)}</span>
      </p>
      {marker.description && (
        <p className="popup-description">
          <Inline text={marker.description} />
        </p>
      )}
      <Coordinates lat={marker.lat} lng={marker.lng} />
      <LandOwner manifest={manifest} county={county} lat={marker.lat} lng={marker.lng} />
      <Links lat={marker.lat} lng={marker.lng} />
      {canEdit && (
        <div className="popup-actions">
          {confirming ? (
            <>
              <span>Delete this marker? Notes and photos on it stay in the notebook.</span>
              <button
                type="button"
                className="small-button danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(marker.id)}
              >
                Delete
              </button>
              <button type="button" className="small-button" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="small-button"
                onClick={() => setMarkerEditor({ mode: 'form', markerId: marker.id })}
              >
                Edit
              </button>
              <button type="button" className="small-button" onClick={() => setConfirming(true)}>
                Delete…
              </button>
            </>
          )}
        </div>
      )}
      {remove.isError && <p className="form-error">{remove.error.message}</p>}
      <PlaceNotebookSection
        place={{
          id: markerFeatureId(marker.id),
          layer: marker.layer,
          name: marker.name,
          lng: marker.lng,
          lat: marker.lat,
        }}
      />
    </div>
  );
}

function distance(meters: number): string {
  if (meters < 10) return 'here';
  const feet = meters * 3.28084;
  return feet < 1000 ? `${Math.round(feet / 10) * 10} ft` : `${(meters / 1609.34).toFixed(1)} mi`;
}

/** A searched coordinate or address: what's there, and a way to mark it. */
function PointPopup({
  pin,
  county,
  manifest,
}: {
  pin: PointPin;
  county: CountyId | null;
  manifest: Manifest;
}) {
  const setMarkerEditor = useHuntStore((s) => s.setMarkerEditor);
  const focusFeature = useHuntStore((s) => s.focusFeature);
  return (
    <div className="popup">
      <h3>{pin.title}</h3>
      <p className="popup-sub">{pin.subtitle}</p>
      {pin.warning && (
        <p className="popup-warning" role="status">
          {pin.warning}
        </p>
      )}
      <Coordinates lat={pin.lat} lng={pin.lng} dms />
      <LandOwner manifest={manifest} county={county} lat={pin.lat} lng={pin.lng} />
      {pin.nearby.length > 0 && (
        <div className="popup-nearby">
          <span className="popup-label">At this spot</span>
          <ul>
            {pin.nearby.map((n) => (
              <li key={`${n.layer}|${n.id}`}>
                <button type="button" className="link-button" onClick={() => focusFeature(n)}>
                  {n.name}
                </button>{' '}
                <span className="muted">
                  {layerName(n.layer)} · {distance(n.meters)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Links lat={pin.lat} lng={pin.lng} />
      <div className="popup-actions">
        <button
          type="button"
          className="small-button"
          onClick={() =>
            setMarkerEditor({ mode: 'form', markerId: null, lat: pin.lat, lng: pin.lng })
          }
        >
          + Marker here
        </button>
      </div>
    </div>
  );
}
