/**
 * Shared validation rules for user-uploaded photos.
 * - Format: JPG/JPEG only
 * - Size: max 200 KB
 */
export const PHOTO_MAX_BYTES = 200 * 1024;
export const PHOTO_ACCEPT = "image/jpeg,.jpg,.jpeg";
export const PHOTO_ALLOWED_MIME = ["image/jpeg", "image/jpg"];

export type PhotoValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validatePhotoFile(file: File): PhotoValidationResult {
  const name = file.name.toLowerCase();
  const isJpeg =
    PHOTO_ALLOWED_MIME.includes(file.type.toLowerCase()) ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg");

  if (!isJpeg) {
    return { ok: false, error: "Format invalide : seuls les fichiers JPG sont acceptés." };
  }
  if (file.size > PHOTO_MAX_BYTES) {
    const kb = Math.round(file.size / 1024);
    return { ok: false, error: `Fichier trop volumineux (${kb} Ko). Maximum : 200 Ko.` };
  }
  return { ok: true };
}
