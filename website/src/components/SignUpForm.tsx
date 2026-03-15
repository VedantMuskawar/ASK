"use client";

import { useState } from "react";
import { signUpUser } from "@/lib/firebase-auth";
import { firebaseAuth } from "@/lib/firebase-auth";

export default function SignUpForm({ onSuccess }: { onSuccess?: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("No authenticated user. Complete OTP verification first.");
      await signUpUser({
        uid: user.uid,
        firstName,
        lastName,
        phone: user.phoneNumber || "",
        email,
        role: "customer",
      });
      setSuccess("Sign up successful!");
      setFirstName("");
      setLastName("");
      setEmail("");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || "Sign up failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="First Name"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          required
          className="flex-1 rounded-xl border border-(--border) px-3 py-2.5 text-sm"
        />
        <input
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={e => setLastName(e.target.value)}
          required
          className="flex-1 rounded-xl border border-(--border) px-3 py-2.5 text-sm"
        />
      </div>
      <input
        type="email"
        placeholder="Email Address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="w-full rounded-xl border border-(--border) px-3 py-2.5 text-sm"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-emerald-600">{success}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-(--accent) py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:opacity-60"
      >
        {loading ? "Signing up..." : "Sign Up"}
      </button>
    </form>
  );
}
