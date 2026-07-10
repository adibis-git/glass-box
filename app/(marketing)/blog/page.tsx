import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Clock, CalendarDays } from "lucide-react";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — Glass Box",
  description:
    "Field notes on operationalizing AI into governed decisions: self-hosting, evidence-first analysis, and the architecture of a glass-box AI analyst.",
};

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> Field notes from the Glass Box team
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          On governed AI, <span className="text-accent">out in the open</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Why enterprises struggle to operationalize AI, why the analyst should come to your data
          instead of the other way around, and how a question becomes a governed answer.
        </p>
      </section>

      {/* Post grid */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col rounded-2xl border border-border bg-panel p-6 transition-colors hover:border-muted/60"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
                  {post.tag}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Clock size={12} /> {post.readMinutes} min read
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold leading-snug tracking-tight text-foreground">
                {post.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{post.excerpt}</p>
              <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                <div className="flex flex-col text-xs text-muted">
                  <span className="text-foreground/80">{post.author}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1.5">
                    <CalendarDays size={12} /> {formatDate(post.date)}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                  Read <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
