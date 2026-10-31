import { markerFeatureId, type Marker } from '@hunt/shared';
import type { FeatureCollection } from 'geojson';

/** Custom markers as GeoJSON for the map's marker source. */
export function markersCollection(markers: readonly Marker[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature',
      properties: {
        id: markerFeatureId(m.id),
        markerId: m.id,
        name: m.name,
        status: m.status,
        layer: m.layer,
      },
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
    })),
  };
}
