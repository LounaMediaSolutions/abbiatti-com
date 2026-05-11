import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Upload } from "lucide-react";
import { toast } from "sonner";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photoUpload";

interface Props {
  userId: string;
  currentUrl?: string | null;
  fallbackEmoji?: string;
  size?: "sm" | "md" | "lg";
  onUploaded?: (url: string) => void;
}

const sizeMap = { sm: "h-12 w-12 text-xl", md: "h-16 w-16 text-2xl", lg: "h-24 w-24 text-4xl" };

export function AvatarUpload({ userId, currentUrl, fallbackEmoji = "👤", size = "md", onUploaded }: Props) {
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
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `users/${userId}.${ext}`;
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
        disabled={uploading}
        className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 disabled:opacity-50"
        aria-label="Upload"
      >
        {uploading ? <Upload className="h-3 w-3 animate-pulse" /> : <Camera className="h-3.5 w-3.5" />}
      </button>
      <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} capture="environment" hidden onChange={handleFile} />
    </div>
  );
}
