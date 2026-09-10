"use client";

import { FormEvent, Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { resetPassword } from "@/lib/auth-api";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError(
        "Reset token is missing. Please use the link sent to your email.",
      );
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsSubmitting(true);
      await resetPassword(token, password);
      setIsSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reset password. The link may be invalid or expired.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-6">
        <div
          role="alert"
          className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-center text-slate-800"
        >
          <AlertCircle className="mx-auto mb-2.5 h-8 w-8 text-amber-600" />
          <p className="text-[14px] font-medium text-amber-950">
            Missing Reset Link
          </p>
          <p className="mt-1 text-[13px] leading-5 text-slate-600">
            This password reset link is invalid or incomplete. Please request a
            new password reset email.
          </p>
        </div>

        <Link
          href="/forgot-password"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          Request New Link
        </Link>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="space-y-6">
        <div
          role="status"
          className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 text-center text-slate-800"
        >
          <CheckCircle2 className="mx-auto mb-2.5 h-8 w-8 text-emerald-600" />
          <p className="text-[14px] font-medium text-emerald-950">
            Password Reset Complete
          </p>
          <p className="mt-1 text-[13px] leading-5 text-slate-600">
            Your password has been successfully updated. You can now sign in
            with your new credentials.
          </p>
        </div>

        <Link
          href="/"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          Sign In Now
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* New Password */}
      <div>
        <label
          htmlFor="new-password"
          className="mb-2 block text-[14px] font-medium text-slate-700"
        >
          New password
        </label>

        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
          />
          <input
            id="new-password"
            name="newPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            disabled={isSubmitting}
            className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-12 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((curr) => !curr)}
            disabled={isSubmitting}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none"
          >
            {showPassword ? (
              <EyeOff className="h-4.5 w-4.5" />
            ) : (
              <Eye className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </div>

      {/* Confirm Password */}
      <div>
        <label
          htmlFor="confirm-password"
          className="mb-2 block text-[14px] font-medium text-slate-700"
        >
          Confirm new password
        </label>

        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
          />
          <input
            id="confirm-password"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            disabled={isSubmitting}
            className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-12 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
          <button
            type="button"
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            onClick={() => setShowConfirmPassword((curr) => !curr)}
            disabled={isSubmitting}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4.5 w-4.5" />
            ) : (
              <Eye className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-3 text-[13px] leading-5 text-red-700"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
            Resetting password...
          </>
        ) : (
          "Reset Password"
        )}
      </button>

      <div className="text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sign In
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 py-10">
      <div className="w-full max-w-105 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="px-7 pb-8 pt-8 sm:px-9">
          {/* Logo */}
          <div className="mb-7 flex justify-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <Image
                src="/icon/intertech-icon.svg"
                alt="Intertech Systems Limited"
                fill
                className="object-contain p-2"
                priority
              />
            </div>
          </div>

          {/* Heading */}
          <div className="mb-7 text-center">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-950">
              Set New Password
            </h1>
            <p className="mt-2 text-[14px] leading-5 text-slate-500">
              Enter and confirm your new password below.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-7 py-4 text-center sm:px-9">
          <p className="text-[12px] text-slate-500">
            Authorized HR personnel only.
          </p>
        </div>
      </div>
    </main>
  );
}
