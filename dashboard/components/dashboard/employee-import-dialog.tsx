"use client";

import { ChangeEvent, useRef, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  importEmployees,
  type EmployeeImportResult,
} from "@/lib/dashboard-api";

interface EmployeeImportDialogProps {
  open: boolean;
  onClose: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function EmployeeImportDialog({
  open,
  onClose,
}: EmployeeImportDialogProps) {
  const { accessToken } = useAuth();

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);

  if (!open) {
    return null;
  }

  function resetState() {
    setFile(null);
    setError("");
    setIsImporting(false);
    setResult(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleClose() {
    if (isImporting) {
      return;
    }

    resetState();
    onClose();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;

    setError("");
    setResult(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const extension = selectedFile.name.split(".").pop()?.toLowerCase();

    if (extension !== "xlsx" && extension !== "xls") {
      setFile(null);
      setError("Please select an Excel spreadsheet (.xlsx or .xls).");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("The spreadsheet must be 10 MB or smaller.");
      return;
    }

    setFile(selectedFile);
  }

  async function handleImport() {
    if (!file || !accessToken) {
      return;
    }

    setIsImporting(true);
    setError("");

    try {
      const response = await importEmployees(file, accessToken);

      setResult(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to import the employee spreadsheet.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-import-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2
              id="employee-import-title"
              className="text-[17px] font-semibold leading-6 text-foreground"
            >
              Import Employee Spreadsheet
            </h2>

            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
              Update the employee master data.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-5">
          {!result ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="sr-only"
              />

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isImporting}
                className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-5 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileSpreadsheet className="size-5" aria-hidden="true" />
                </span>

                <span className="mt-3 text-[14px] font-medium text-foreground">
                  {file ? "Change spreadsheet" : "Choose spreadsheet"}
                </span>

                <span className="mt-1 max-w-full truncate text-[12px] leading-5 text-muted-foreground">
                  {file ? file.name : ".xlsx or .xls · Maximum 10 MB"}
                </span>
              </button>

              {file ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
                  <FileSpreadsheet
                    className="size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />

                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {file.name}
                  </span>

                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="mt-3 text-[13px] leading-5 text-danger"
                >
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                <Upload className="size-4 text-success" aria-hidden="true" />
                Employee spreadsheet imported
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <ResultItem label="Total rows" value={result.totalRows} />

                <ResultItem label="Created" value={result.created} />

                <ResultItem label="Updated" value={result.updated} />

                <ResultItem label="Failed" value={result.failed} />

                <ResultItem
                  label="Needs review"
                  value={result.needsDepartmentReview}
                />
              </div>

              {result.failed > 0 ? (
                <p className="mt-4 text-[12px] leading-5 text-muted-foreground">
                  Some rows could not be imported. Review the failed-row report
                  generated by the import process.
                </p>
              ) : null}

              {result.needsDepartmentReview > 0 ? (
                <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                  Some employees were imported without a confirmed department
                  and require review.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          {!result ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={isImporting}
                className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleImport}
                disabled={!file || !accessToken || isImporting}
                className="rounded-lg bg-brand-blue-rev px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isImporting ? "Importing..." : "Import"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-brand-blue-rev px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>

      <p className="mt-0.5 text-[17px] font-semibold leading-6 text-foreground">
        {value}
      </p>
    </div>
  );
}
