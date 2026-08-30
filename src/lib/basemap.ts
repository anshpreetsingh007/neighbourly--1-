/**
 * Which map tiles to draw, shared by the Map screen and the Post a Job preview.
 *
 * CARTO's raster basemaps now watermark every unauthenticated tile with
 * "API KEY REQUIRED", so their styles are used only when a key is configured.
 * Without one we fall back to OpenStreetMap, which needs no key - a plain light
 * map beats one covered in watermarks.
 *
 * Free key (5M tiles/month): https://carto.com/basemaps/apikey
 */

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;

export interface Basemap {
  url: string;
  attribution: string;
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const basemapFor = (theme: 'light' | 'dark'): Basemap => {
  if (!CARTO_KEY) {
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: OSM_ATTRIBUTION,
    };
  }

  // A dark map beneath a light UI reads as a rendering bug, so the basemap
  // follows the app theme.
  const style = theme === 'dark' ? 'dark_all' : 'voyager_labels_under';
  return {
    url: `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
  };
};
