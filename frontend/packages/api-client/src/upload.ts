import { createClient } from "@connectrpc/connect";
import type { Api } from "./client";
import { UploadService } from "./gen/lms/v1/uploads_pb";
import type { PresignInput, Upload } from "./gen/lms/v1/types_pb";

export type UploadPurpose = PresignInput["purpose"];

/**
 * Uploads a file straight to object storage:
 * 1) ask the API for a presigned URL, 2) PUT the bytes (with progress), 3) confirm with the API.
 */
export async function uploadFile(api: Api, file: File, purpose: UploadPurpose, onProgress?: (fraction: number) => void): Promise<Upload> {
  const uploads = createClient(UploadService, api.transport);
  const mime = file.type || "application/octet-stream";
  const { presigned } = await uploads.presignUpload({ input: { purpose, fileName: file.name, mime, size: file.size } });
  if (!presigned?.upload) throw new Error("Could not start the upload");
  const { putUrl, headers, upload } = presigned;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", putUrl);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(file);
  });

  const done = await uploads.completeUpload({ id: upload.id });
  if (!done.upload) throw new Error("Upload could not be confirmed");
  onProgress?.(1);
  return done.upload;
}
