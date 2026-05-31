import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Upload } from "lucide-react";
import { toast } from "sonner";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photoUpload";

interface Props {
  userId: string;
  /**
   * Organization the avatar belongs to. REQUIRED for upload to succeed: the
   * `avatars` storage bucket RLS scopes objects by an org folder and checks
   * `is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)`, so the
   * path convention is `<organizationId>/<userId>.<ext>`. Uploading under any
   * non-UUID folder (e.g. the old `users/`) makes the policy's `::uuid` cast
   * throw and the upload is denied. Pass the uploader's own org (for self
   * edits) or the managed member's org (admins/cohosts edit same-org members).
   */
  organizationId: string | null | undefined;
  currentUrl?: string | null;
  fallbackEmoji?: string;
  size?: "sm" | "md" | "lg";
  onUploaded?: (url: string) => void;
}

const sizeMap = { sm: "h-12 w-12 text-xl", md: "h-16 w-16 text-2xl", lg: "h-24 w-24 text-4xl" };

export function AvatarUpload({ userId, organizationId, currentUrl, fallbackEmoji = "👤", size = "md", onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(currentUrl ?? null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validatePhotoFile(file);
    if (v.ok === false) {
      toast.error(v.error);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    // Without an org we can't build a path the storage RLS will accept, so
    // bail with a clear message instead of attempting an upload that the
    // policy's `::uuid` cast would reject.
    if (!organizationId) {
      toast.error("No organization — cannot upload avatar.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      // Sanitize the extension: a crafted filename like "a.jp/g" would otherwise
      // inject a slash into the storage path and create a stray subfolder. Keep
      // only a short alphanumeric suffix, defaulting to jpg.
      const rawExt = file.name.split(".").pop() ?? "";
      const ext = (/^[a-zA-Z0-9]{1,5}$/.test(rawExt) ? rawExt : "jpg").toLowerCase();
      // Path convention enforced by the avatars bucket RLS: <org_id>/<user_id>.
      const path = `${organizationId}/${userId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (pErr) throw pErr;
      setUrl(publicUrl);
      onUploaded?.(publicUrl);
      toast.success("OK");
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Without an org we cannot construct a path the storage RLS will accept, so
  // the upload button is disabled with a clear tooltip rather than waiting for
  // the user to pick a file and then erroring. Avoids the race where parent
  // state (org_id) is still resolving on first render.
  const canUpload = !!organizationId;

  return (
    <div className="relative inline-block">
      {url ? (
        <img src={url} alt="" className={`${sizeMap[size]} rounded-full object-cover border-2 border-border`} />
      ) : (
        <div className={`${sizeMap[size]} rounded-full bg-muted flex items-center justify-center border-2 border-border`}>
          {fallbackEmoji}
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !canUpload}
        title={canUpload ? undefined : "Avatar upload unavailable until your organization is loaded"}
        className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Upload avatar"
      >
        {uploading ? <Upload className="h-3 w-3 animate-pulse" /> : <Camera className="h-3.5 w-3.5" />}
      </button>
      <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} capture="environment" hidden onChange={handleFile} />
    </div>
  );
}
