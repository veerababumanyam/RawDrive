"use client";
import { useEffect, useState } from "react";
import {
  getDealerPhotographers,
  type StatePhotographer,
} from "@/lib/api/dealer";
function PlanBadge({ plan, status }: { plan: string; status: string }) {
  if (!plan || status === "none") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-container text-text-tertiary">
        {" "}
        No plan{" "}
      </span>
    );
  }
  const label = plan
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
      {" "}
      {label}{" "}
    </span>
  );
}
const PHOTO_PAGE_SIZE = 25;
export default function DealerPhotographersPage() {
  const [photographers, setPhotographers] = useState<StatePhotographer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    getDealerPhotographers()
      .then(setPhotographers)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load photographers",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const filtered = photographers.filter(
    (p) =>
      search.trim() === "" ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()),
  );
  const pageCount = Math.ceil(filtered.length / PHOTO_PAGE_SIZE);
  const pageData = filtered.slice(
    page * PHOTO_PAGE_SIZE,
    (page + 1) * PHOTO_PAGE_SIZE,
  );
  return (
    <div className="space-y-6">
      {" "}
      <div>
        {" "}
        <h1 className="font-headline text-2xl font-bold text-text-primary">
          {" "}
          Photographers in Your State{" "}
        </h1>{" "}
        <p className="mt-1 text-sm text-text-secondary">
          {" "}
          All registered photographers from your territory with their active
          subscription plan.{" "}
        </p>{" "}
      </div>{" "}
      {error && (
        <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {" "}
          {error}{" "}
        </div>
      )}{" "}
      <div className="flex items-center gap-3">
        {" "}
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search by name or email…"
          className="input-base flex-1 max-w-sm"
        />{" "}
        {!loading && (
          <span className="text-sm text-text-tertiary">
            {" "}
            {filtered.length} photographer
            {filtered.length !== 1 ? "s" : ""}{" "}
          </span>
        )}{" "}
      </div>{" "}
      {loading ? (
        <div className="space-y-2">
          {" "}
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-surface-sunken animate-pulse"
            />
          ))}{" "}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
          {" "}
          <p className="text-sm text-text-tertiary">
            {" "}
            {search
              ? "No photographers match your search."
              : "No photographers registered in your state yet."}{" "}
          </p>{" "}
        </div>
      ) : (
        <div className="glass-card overflow-hidden rounded-2xl">
          {" "}
          <table className="w-full table-auto text-sm">
            {" "}
            <thead>
              {" "}
              <tr className="border-b border-border-subtle">
                {" "}
                <th className="px-4 py-3 text-left font-medium text-text-secondary">
                  Name
                </th>{" "}
                <th className="px-4 py-3 text-left font-medium text-text-secondary">
                  Email
                </th>{" "}
                <th className="px-4 py-3 text-left font-medium text-text-secondary">
                  Subscription Plan
                </th>{" "}
              </tr>{" "}
            </thead>{" "}
            <tbody className="divide-y divide-border-subtle">
              {" "}
              {pageData.map((p) => (
                <tr
                  key={p.user_id}
                  className="hover:bg-surface-overlay/5 transition-colors"
                >
                  {" "}
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {" "}
                    {p.full_name || (
                      <span className="text-text-tertiary">—</span>
                    )}{" "}
                  </td>{" "}
                  <td className="px-4 py-3 text-text-secondary">{p.email}</td>{" "}
                  <td className="px-4 py-3">
                    {" "}
                    <PlanBadge
                      plan={p.subscription_plan}
                      status={p.subscription_status}
                    />{" "}
                  </td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-sm text-text-secondary">
              {" "}
              <span>
                Page {page + 1} of {pageCount} ({filtered.length} total)
              </span>{" "}
              <div className="flex gap-2">
                {" "}
                <button
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs hover:bg-surface-overlay/5 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  {" "}
                  Previous{" "}
                </button>{" "}
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pageCount - 1}
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs hover:bg-surface-overlay/5 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  {" "}
                  Next{" "}
                </button>{" "}
              </div>{" "}
            </div>
          )}{" "}
        </div>
      )}{" "}
    </div>
  );
}
