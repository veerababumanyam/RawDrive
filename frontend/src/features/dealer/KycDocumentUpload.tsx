// Design source: Stitch MCP Liquid Glass — glass-card containers with dashed upload zones
"use client";

import { useState, useCallback } from "react";

const DOC_TYPES = [
  { key: "pan_card", label: "PAN Card", required: true },
  { key: "aadhaar", label: "Aadhaar Card", required: true },
  { key: "business_registration", label: "Business Registration", required: true },
] as const;

interface Props {
  dealerId: string;
  onComplete: () => void;
}

type UploadStatus = "pending" | "uploading" | "uploaded" | "error";

export default function KycDocumentUpload({ dealerId, onComplete }: Props) {
  const [uploads, setUploads] = useState<Record<string, UploadStatus>>(
    Object.fromEntries(DOC_TYPES.map((d) => [d.key, "pending"]))
  );

  const allUploaded = DOC_TYPES.every((d) => uploads[d.key] === "uploaded");

  const handleUpload = useCallback(async (docType: string, file: File) => {
    setUploads((prev) => ({ ...prev, [docType]: "uploading" }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", docType);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/admin/dealers/${dealerId}/kyc`,
        { method: "POST", body: formData }
      );
      if (!res.ok) throw new Error("Upload failed");
      setUploads((prev) => ({ ...prev, [docType]: "uploaded" }));
    } catch {
      setUploads((prev) => ({ ...prev, [docType]: "error" }));
    }
  }, [dealerId]);

  const statusStyles: Record<UploadStatus, string> = {
    pending: "border-outline-variant/30 text-text-tertiary",
    uploading: "border-accent-secondary/50 text-accent-secondary animate-pulse",
    uploaded: "border-accent-primary/50 text-accent-primary bg-accent-primary/5",
    error: "border-feedback-error/50 text-feedback-error bg-feedback-error/5",
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-text-primary">KYC Document Upload</h3>
      <p className="text-sm text-text-secondary">Upload all 3 required documents to proceed.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DOC_TYPES.map((doc) => (
          <label
            key={doc.key}
            className={`glass-card p-6 border-2 border-dashed rounded-2xl cursor-pointer text-center space-y-3 min-h-[160px] flex flex-col items-center justify-center transition-colors ${statusStyles[uploads[doc.key]]}`}
          >
            <span className="text-2xl">
              {uploads[doc.key] === "uploaded" ? "✓" : uploads[doc.key] === "uploading" ? "⟳" : "↑"}
            </span>
            <span className="text-sm font-medium">{doc.label}</span>
            <span className="text-xs capitalize">{uploads[doc.key]}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(doc.key, file);
              }}
              disabled={uploads[doc.key] === "uploading"}
            />
          </label>
        ))}
      </div>

      <button
        onClick={onComplete}
        disabled={!allUploaded}
        className="btn-primary w-full min-h-[44px] disabled:opacity-50 rounded-full"
      >
        Submit for Review
      </button>
    </div>
  );
}
