import type { Api, Schemas } from "./client";

export type UploadPurpose = Schemas["PresignInput"]["purpose"];

/**
 * Uploads a file straight to object storage:
 * 1) ask the API for a presigned URL, 2) PUT the bytes (with progress), 3) confirm with the API.
 */
export async function uploadFile(
  api: Api,
  file: File,
  purpose: UploadPurpose,
  onProgress?: (fraction: number) => void,
): Promise<Schemas["Upload"]> {
  const mime = file.type || "application/octet-stream";
  const pre = await api.client.POST("/api/v1/uploads/presign", { body: { purpose, file_name: file.name, mime, size: file.size } });
  if (pre.error || !pre.data) throw pre.error ?? new Error("Could not start the upload");
  const { put_url, headers, upload } = pre.data;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", put_url);
    Object.entries(headers ?? {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(file);
  });

  const done = await api.client.POST("/api/v1/uploads/{id}/complete", { params: { path: { id: upload.id } } });
  if (done.error || !done.data) throw done.error ?? new Error("Upload could not be confirmed");
  onProgress?.(1);
  return done.data;
}
