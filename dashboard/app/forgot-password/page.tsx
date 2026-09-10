"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { forgotPassword } from "@/lib/auth-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setIsSubmitting(true);
      await forgotPassword(normalizedEmail);
      setIsSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process request. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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
              Forgot Password
            </h1>
            <p className="mt-2 text-[14px] leading-5 text-slate-500">
              Enter your email address to receive password reset instructions.
            </p>
          </div>

          {isSubmitted ? (
            <div className="space-y-6">
              <div
                role="status"
                className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 text-center text-slate-800"
              >
                <CheckCircle2 className="mx-auto mb-2.5 h-8 w-8 text-emerald-600" />
                <p className="text-[14px] font-medium text-emerald-950">
                  Check your email
                </p>
                <p className="mt-1 text-[13px] leading-5 text-slate-600">
                  If an active account exists with that email, a password reset link
                  has been sent. The link expires in 60 minutes.
                </p>
              </div>

              <Link
                href="/"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="mb-2 block text-[14px] font-medium text-slate-700"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
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
                    Sending link...
                  </>
                ) : (
                  "Send Reset Link"
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
          )}
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
