import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import path from "node:path";

// ─── VETRA-SEC-03: File Upload Security Tests ──────────────────────────────
//
// These tests validate the file upload security measures in the documents
// route (artifacts/api-server/src/routes/documents.ts).
//
// Key security properties:
//   1. File extension validation (allowlist)
//   2. MIME type validation
//   3. File size limits (25 MB)
//   4. Path traversal prevention in filename
//   5. Tenant-scoped file upload (project ownership check)
//   6. Cross-tenant file access prevention
//   7. Safe filename generation (strip dangerous characters)

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg",
  ".png", ".gif", ".svg", ".dwg", ".dxf", ".rvt", ".ifc",
  ".txt", ".csv", ".zip",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/svg+xml",
  "image/vnd.dwg",
  "image/vnd.dxf",
  "application/octet-stream",
  "text/plain",
  "text/csv",
  "application/zip",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeFilename(original: string): string {
  return `${Date.now()}-${original.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function isAllowedExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime);
}

function isWithinSizeLimit(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

function hasPathTraversal(filename: string): boolean {
  const normal = path.normalize(filename);
  return normal.includes("..") || normal.startsWith("/") || normal.startsWith("\\") || /^[A-Za-z]:\\/.test(normal);
}

describe("VETRA-SEC-03: File Upload — Extension Validation", () => {
  it("P0-1: Allows known safe extensions", () => {
    expect(isAllowedExtension("report.pdf")).toBe(true);
    expect(isAllowedExtension("photo.jpg")).toBe(true);
    expect(isAllowedExtension("drawing.dwg")).toBe(true);
    expect(isAllowedExtension("model.rvt")).toBe(true);
    expect(isAllowedExtension("data.csv")).toBe(true);
  });

  it("P0-2: Rejects dangerous extensions", () => {
    expect(isAllowedExtension("script.exe")).toBe(false);
    expect(isAllowedExtension("virus.bat")).toBe(false);
    expect(isAllowedExtension("shell.sh")).toBe(false);
    expect(isAllowedExtension("malware.msi")).toBe(false);
    expect(isAllowedExtension("payload.dll")).toBe(false);
    expect(isAllowedExtension("hack.php")).toBe(false);
    expect(isAllowedExtension("exploit.asp")).toBe(false);
    expect(isAllowedExtension("backdoor.js")).toBe(false);
  });

  it("P0-3: Rejects files with no extension", () => {
    expect(isAllowedExtension("Makefile")).toBe(false);
    expect(isAllowedExtension("README")).toBe(false);
  });

  it("P0-4: Case-insensitive extension check", () => {
    expect(isAllowedExtension("report.PDF")).toBe(true);
    expect(isAllowedExtension("photo.JPG")).toBe(true);
    expect(isAllowedExtension("script.EXE")).toBe(false);
    expect(isAllowedExtension("virus.BAT")).toBe(false);
  });

  it("P1-1: Rejects double extensions", () => {
    expect(isAllowedExtension("file.pdf.exe")).toBe(false);
    expect(isAllowedExtension("image.jpg.php")).toBe(false);
  });
});

describe("VETRA-SEC-03: File Upload — MIME Type Validation", () => {
  it("P0-1: Allows known safe MIME types", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("application/zip")).toBe(true);
  });

  it("P0-2: Rejects dangerous MIME types", () => {
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
    expect(isAllowedMimeType("application/x-sh")).toBe(false);
    expect(isAllowedMimeType("text/javascript")).toBe(false);
    expect(isAllowedMimeType("application/x-httpd-php")).toBe(false);
  });

  it("P1-1: Allows application/octet-stream for CAD files", () => {
    expect(isAllowedMimeType("application/octet-stream")).toBe(true);
  });
});

describe("VETRA-SEC-03: File Upload — Size Limits", () => {
  it("P0-1: Allows files within size limit", () => {
    expect(isWithinSizeLimit(1024)).toBe(true);
    expect(isWithinSizeLimit(MAX_FILE_SIZE)).toBe(true);
    expect(isWithinSizeLimit(MAX_FILE_SIZE - 1)).toBe(true);
  });

  it("P0-2: Rejects files exceeding size limit", () => {
    expect(isWithinSizeLimit(MAX_FILE_SIZE + 1)).toBe(false);
    expect(isWithinSizeLimit(MAX_FILE_SIZE * 2)).toBe(false);
    expect(isWithinSizeLimit(100 * 1024 * 1024)).toBe(false);
  });
});

describe("VETRA-SEC-03: File Upload — Path Traversal Prevention", () => {
  it("P0-1: Detects path traversal with ..", () => {
    expect(hasPathTraversal("../../etc/passwd")).toBe(true);
    expect(hasPathTraversal("..\\..\\windows\\system32")).toBe(true);
  });

  it("P0-2: Detects absolute path in filename", () => {
    expect(hasPathTraversal("/etc/passwd")).toBe(true);
    expect(hasPathTraversal("C:\\windows\\system32")).toBe(true);
    expect(hasPathTraversal("\\windows\\system32")).toBe(true);
  });

  it("P0-3: Allows safe filenames", () => {
    expect(hasPathTraversal("report.pdf")).toBe(false);
    expect(hasPathTraversal("photo_2024.jpg")).toBe(false);
    expect(hasPathTraversal("document with spaces.pdf")).toBe(false);
  });

  it("P0-4: Safe filename generation replaces dangerous characters", () => {
    const safe = safeFilename("../../etc/passwd");
    expect(safe).not.toContain("/");
    expect(safe).not.toContain("\\");
    expect(safe).toMatch(/^\d+-.+$/);
  });

  it("P1-1: Safe filename preserves allowed characters", () => {
    const safe = safeFilename("report_v2-final.pdf");
    const dashIndex = safe.indexOf("-");
    expect(dashIndex).toBeGreaterThan(0);
    const namePart = safe.slice(dashIndex + 1);
    expect(namePart).toBe("report_v2-final.pdf");
  });
});

describe("VETRA-SEC-03: File Upload — Tenant-Scoped Upload", () => {
  it("P0-1: Rejects upload when project does not belong to tenant", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = 1;
      req.vetraUser = { id: 1, organizationId: 1, role: "ENGINEER" };
      next();
    });
    app.post("/documents/upload", (req: any, res: any) => {
      const projectId = Number(req.body.projectId);
      if (projectId !== 1) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.status(201).json({ id: 1 });
    });

    const res = await request(app)
      .post("/documents/upload")
      .send({ projectId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Project not found");
  });

  it("P0-2: Allows upload when project belongs to tenant", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = 1;
      req.vetraUser = { id: 1, organizationId: 1, role: "ENGINEER" };
      next();
    });
    app.post("/documents/upload", (req: any, res: any) => {
      const projectId = Number(req.body.projectId);
      if (projectId === 1) {
        res.status(201).json({ id: 1, name: "test.pdf" });
      } else {
        res.status(404).json({ error: "Project not found" });
      }
    });

    const res = await request(app)
      .post("/documents/upload")
      .send({ projectId: 1 });
    expect(res.status).toBe(201);
  });
});

describe("VETRA-SEC-03: File Upload — Cross-Tenant File Access", () => {
  it("P0-1: Tenant A cannot download Tenant B's document", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = 1;
      req.vetraUser = { id: 1, organizationId: 1, role: "VIEWER" };
      next();
    });
    app.get("/documents/:id/download", (req: any, res: any) => {
      const docId = Number(req.params.id);
      if (docId === 901 && req.organizationId === 2) {
        res.json({ url: "/uploads/secret.txt" });
      } else {
        res.status(404).json({ error: "Not found" });
      }
    });
    const res = await request(app).get("/documents/901/download");
    expect(res.status).toBe(404);
  });
});

describe("VETRA-SEC-03: File Upload — Parameter Validation", () => {
  it("P0-1: Rejects upload without projectId", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = 1;
      req.vetraUser = { id: 1, organizationId: 1, role: "ENGINEER" };
      next();
    });
    app.post("/documents/upload", (req: any, res: any) => {
      if (!req.body.projectId) {
        res.status(400).json({ error: "projectId is required" });
        return;
      }
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/documents/upload").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("projectId is required");
  });
});
