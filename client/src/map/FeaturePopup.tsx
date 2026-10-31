import {
  kindLabel,
  landKindName,
  layerName,
  statusName,
  type CountyId,
  type Manifest,
  type Marker,
  type PlaceProperties,
} from '@hunt/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useDeleteMarker } from '../api';
import { landOwnerAt } from '../layerData';
import { useHuntStore } from '../state/store';

export type PopupTarget =
  | { type: 'place'; props: PlaceProperties; lng: number; lat: number }
  | { type: 'marker'; marker: Marker; county: CountyId | null };

function formatCoord(n: number): string {
  return n.toFixed(5);
}

function Coordinates({ lat, lng }: { lat: number; lng: number }) {
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
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="popup">
      <h3>{marker.name}</h3>
      <p className="popup-sub">Custom marker · {layerName(marker.layer)}</p>
      <p>
        <span className={`status-badge status-${marker.status}`}>{statusName(marker.status)}</span>
      </p>
      {marker.description && <p className="popup-description">{marker.description}</p>}
      <Coordinates lat={marker.lat} lng={marker.lng} />
      <LandOwner manifest={manifest} county={county} lat={marker.lat} lng={marker.lng} />
      <Links lat={marker.lat} lng={marker.lng} />
      <div className="popup-actions">
        {confirming ? (
          <>
            <span>Delete this marker?</span>
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
      {remove.isError && <p className="form-error">{remove.error.message}</p>}
    </div>
  );
}
