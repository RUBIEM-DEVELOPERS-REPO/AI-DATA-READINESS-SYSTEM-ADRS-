import multer from "multer";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import https from "https";
import http from "http";
import { isSafeRemoteUrl } from "./security";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Temporary staging directory for incoming uploads. MUST be separate from
// UPLOADS_DIR (the persistent object-store dir): the upload flow writes the
// temp file here, copies it into the object store, then deletes the temp copy.
// If both share a directory, the delete would remove the stored file too,
// leaving every evidence record pointing at a file that no longer exists on disk.
export const UPLOADS_TEMP_DIR = path.join(process.cwd(), ".tmp-uploads");
if (!fs.existsSync(UPLOADS_TEMP_DIR)) fs.mkdirSync(UPLOADS_TEMP_DIR, { recursive: true });

const allowedExtensions = new Set([
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".txt",
  ".csv",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".tiff",
  ".bmp",
  ".gif",
  ".mp3",
  ".wav",
  ".aac",
  ".flac",
  ".ogg",
  ".m4a",
  ".mp4",
  ".mov",
  ".webm",
  ".avi",
  ".mkv",
  ".m4v",
]);

const diskStorage = multer.diskStorage({
  destination: UPLOADS_TEMP_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export function validateUploadFile(file: Express.Multer.File): { ok: true } | { ok: false; error: string } {
  const ext = path.extname(file.originalname).toLowerCase();
  const basename = path.basename(file.originalname);

  if (!basename || basename.includes("..") || basename.includes("/")) {
    return { ok: false, error: "Invalid filename" };
  }

  if (!allowedExtensions.has(ext)) {
    return { ok: false, error: `Unsupported file type: ${ext || "unknown"}` };
  }

  if (process.env.NODE_ENV === "production") {
    const suspicious = [".exe", ".bat", ".cmd", ".com", ".scr", ".jar", ".ps1", ".dll", ".so", ".dylib"];
    if (suspicious.includes(ext)) {
      return { ok: false, error: `Unsupported file type: ${ext || "unknown"}` };
    }
  }

  return { ok: true };
}

import { assertFileSafe } from "./malware-scan";

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const result = validateUploadFile(file);
  if (!result.ok) return cb(new Error(result.error));
  cb(null, true);
}

const multerUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter,
}).single("file");

export const uploadMiddleware = (req: any, res: any, next: any) => {
  multerUpload(req, res, (err: any) => {
    if (err) return next(err);
    if (req.file) {
      try {
        assertFileSafe(req.file.path);
      } catch (scanErr: any) {
        return next(scanErr);
      }
    }
    next();
  });
};

export function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

export function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    tiff: "image/tiff",
    bmp: "image/bmp",
    gif: "image/gif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    flac: "audio/flac",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    m4v: "video/mp4",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

export function detectCloudSource(url: string): { source: string; downloadUrl: string; fileName: string } {
  try {
    const u = new URL(url);

    if (u.hostname === "drive.google.com" || u.hostname === "docs.google.com") {
      let fileId = "";
      const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
      const idParam = u.searchParams.get("id");
      const docMatch = u.pathname.match(/\/document\/d\/([^/]+)/) ??
                       u.pathname.match(/\/spreadsheets\/d\/([^/]+)/) ??
                       u.pathname.match(/\/presentation\/d\/([^/]+)/);
      if (fileMatch) fileId = fileMatch[1];
      else if (idParam) fileId = idParam;
      else if (docMatch) fileId = docMatch[1];

      const downloadUrl = fileId
        ? `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`
        : url;
      return { source: "GOOGLE_DRIVE", downloadUrl, fileName: `google_drive_${fileId || "file"}` };
    }

    if (u.hostname.includes("dropbox.com")) {
      const dlUrl = url.replace("?dl=0", "?dl=1").replace("www.dropbox.com", "dl.dropboxusercontent.com");
      const name = path.basename(u.pathname).replace(/\?.*/, "");
      return { source: "SHAREPOINT", downloadUrl: dlUrl, fileName: name || "dropbox_file" };
    }

    if (u.hostname.includes("1drv.ms") || u.hostname.includes("sharepoint.com") || u.hostname.includes("onedrive.live.com")) {
      const name = path.basename(u.pathname).replace(/\?.*/, "") || "onedrive_file";
      return { source: "SHAREPOINT", downloadUrl: url, fileName: name };
    }

    const name = path.basename(u.pathname).replace(/\?.*/, "") || "imported_file";
    return { source: "FTP", downloadUrl: url, fileName: name };
  } catch {
    return { source: "FTP", downloadUrl: url, fileName: "imported_file" };
  }
}

export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isSafeRemoteUrl(url)) {
      reject(new Error("Refusing to download from an unsafe or local URL"));
      return;
    }

    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);

    function doRequest(reqUrl: string, redirectCount = 0) {
      if (redirectCount > 5) { reject(new Error("Too many redirects")); return; }
      proto.get(reqUrl, { headers: { "User-Agent": "ADRS-Evidence-Ingestor/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) {
          const loc = res.headers.location;
          if (loc) { doRequest(loc, redirectCount + 1); return; }
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${reqUrl}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      }).on("error", reject);
    }

    doRequest(url);
  });
}
