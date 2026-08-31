/**
 * Cloudinary serves a resized, reformatted copy of an image if you ask for one
 * in the URL path. We were rendering the raw `secure_url` everywhere, so a 4MB
 * phone photo was downloaded in full to fill a 96px tile - and the free tier
 * bills bandwidth, so that is the thing that actually runs the quota out.
 *
 * Each distinct size is generated once and then served from Cloudinary's CDN,
 * so the transformation cost is per-variant, not per-view.
 */

/** Only rewrite our own Cloudinary delivery URLs. */
const CLOUDINARY_UPLOAD = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;

interface Options {
  /** Rendered width in CSS pixels. Doubled for retina screens. */
  width: number;
  /** Rendered height in CSS pixels. Set it when the image is cropped to a box. */
  height?: number;
}

export function optimizedImage(url: string | null | undefined, { width, height }: Options) {
  if (!url) return url ?? undefined;
  // Google OAuth avatars and anything else external must pass through
  // untouched - splicing Cloudinary parameters into them would 404.
  if (!CLOUDINARY_UPLOAD.test(url)) return url;
  // Already transformed (an f_auto segment is ours): leave it alone rather
  // than stacking a second set of parameters on top.
  if (/\/image\/upload\/[^/]*f_auto/.test(url)) return url;

  const dpr = 2;
  const params = [
    'f_auto', // WebP/AVIF where the browser supports it
    'q_auto', // quality chosen per image rather than a fixed number
    `w_${Math.round(width * dpr)}`,
  ];
  if (height) {
    params.push(`h_${Math.round(height * dpr)}`, 'c_fill');
  } else {
    // Never upscale a photo that is already smaller than the slot.
    params.push('c_limit');
  }

  return url.replace(CLOUDINARY_UPLOAD, match => `${match}${params.join(',')}/`);
}

/**
 * Every photo is stored and served on a bandwidth-billed plan, so a job with
 * fifty images is a real cost, not just a long page. Mirrors PHOTO_MAX in
 * api/index.ts, which is the copy that actually enforces it.
 */
export const PHOTO_MAX = 10;
