/**
 * Multipart upload to one of the app's API routes (POST /api/documents,
 * /api/questionnaires, /api/library/import). Server Actions cap bodies at
 * 1 MB, so files go to the routes, which authorise with the session cookie.
 *
 * XMLHttpRequest instead of fetch: fetch cannot report upload progress.
 * Same-origin, so the session cookie is sent just as fetch would send it.
 */

export type UploadResponse<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string; upgradeUrl?: string };

type ErrorBody = { error?: unknown; code?: unknown; upgradeUrl?: unknown };

function errorFrom(status: number, body: ErrorBody | null): UploadResponse<never> {
  const fallback =
    status === 401
      ? "Your session expired. Sign in again to upload."
      : status === 413
        ? "The file is larger than 10 MB."
        : status === 0
          ? "The upload did not reach Attestly. Check your connection and try again."
          : "The upload failed. Please try again.";
  return {
    ok: false,
    status,
    error: typeof body?.error === "string" && body.error ? body.error : fallback,
    ...(typeof body?.code === "string" ? { code: body.code } : {}),
    ...(typeof body?.upgradeUrl === "string" ? { upgradeUrl: body.upgradeUrl } : {}),
  };
}

export function uploadWithProgress<T>(
  url: string,
  form: FormData,
  options: { onProgress?: (fraction: number) => void; onUploaded?: () => void; signal?: AbortSignal } = {},
): Promise<UploadResponse<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total);
    };
    xhr.upload.onload = () => {
      options.onProgress?.(1);
      options.onUploaded?.();
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body !== null) {
        resolve({ ok: true, status: xhr.status, data: body as T });
      } else {
        resolve(errorFrom(xhr.status, body as ErrorBody | null));
      }
    };
    xhr.onerror = () => resolve(errorFrom(0, null));
    xhr.onabort = () => resolve({ ok: false, status: 0, error: "Upload cancelled." });
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
