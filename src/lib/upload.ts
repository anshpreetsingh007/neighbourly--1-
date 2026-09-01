import axios from 'axios';

/**
 * Longest edge we send to Cloudinary. A modern phone photo is around 4000px
 * and 3-5MB; at 1600px it is roughly 300KB, and nothing in the app ever
 * displays an image larger than the detail hero. Storage is billed per GB, so
 * this is about a 10x difference in how many photos fit in the free tier.
 */
export const MAX_UPLOAD_DIMENSION = 1600;

/** Below this, re-encoding costs more quality than it saves bytes. */
const SKIP_RESIZE_BELOW_BYTES = 400 * 1024;

const JPEG_QUALITY = 0.85;

export type UploadFolder = 'neighbourly_jobs' | 'neighbourly_avatars' | 'neighbourly_chat';

/**
 * Decodes the file with EXIF orientation applied, so a photo taken in portrait
 * does not come out sideways - the browser honours that tag when displaying an
 * <img>, but drawing to a canvas drops it unless you ask.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Shrinks an oversized photo in the browser before it is uploaded. Returns the
 * original file untouched whenever resizing would not help or cannot be done -
 * a failure here must never block someone from posting.
 */
export async function resizeImage(file: File): Promise<File> {
  // GIFs are usually animated and a canvas would flatten them to one frame.
  // SVGs have no meaningful pixel size to shrink.
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  if (file.size <= SKIP_RESIZE_BELOW_BYTES) return file;

  try {
    const source = await decode(file);
    const width = 'width' in source ? source.width : 0;
    const height = 'height' in source ? source.height : 0;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // JPEG has no alpha channel, so a transparent PNG would otherwise come out
    // with a black background.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight);
    if ('close' in source) source.close();

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    // An already-efficient file can come out larger after re-encoding.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.error('Could not resize image, uploading the original:', err);
    return file;
  }
}

/**
 * Signs, resizes and uploads one image, returning its Cloudinary URL. The file
 * goes straight from the browser to Cloudinary - our API only ever issues the
 * signature, so a free-tier server never has to hold an upload in memory.
 */
export async function uploadImage(file: File, folder: UploadFolder): Promise<string> {
  const { data: signData } = await axios.post('/api/uploads/sign', { folder });

  const prepared = await resizeImage(file);

  const body = new FormData();
  body.append('file', prepared);
  body.append('api_key', signData.api_key);
  body.append('timestamp', signData.timestamp);
  body.append('signature', signData.signature);
  body.append('folder', signData.folder);

  const { data } = await axios.post(
    `https://api.cloudinary.com/v1_1/${signData.cloud_name}/image/upload`,
    body
  );
  return data.secure_url as string;
}
