import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/Markdown";
import { POSTS, getPost } from "@/lib/blog";

export async function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    return { title: "Post not found — Glass Box" };
  }
  return {
    title: `${post.title} — Glass Box`,
    description: post.excerpt,
  };
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} /> Back to blog
      </Link>

      <div className="mt-8">
        <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
          {post.tag}
        </span>
      </div>

      <h1 className="mt-4 text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-4xl">
        {post.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={14} /> {formatDate(post.date)}
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Clock size={14} /> {post.readMinutes} min read
        </span>
        <span className="text-border">·</span>
        <span className="text-foreground/80">{post.author}</span>
      </div>

      <hr className="my-8 border-border" />

      <Markdown text={post.body} className="text-base leading-relaxed" />

      {/* Closing CTA */}
      <div className="mt-14 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-8 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          See Glass Box on your own data
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          A governed AI analyst, self-hosted on your infrastructure and powered by
          claude-sonnet-5. Book a walkthrough and watch it work end to end.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/demo">
            <Button variant="primary">
              Book a demo <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-10">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} /> Back to blog
        </Link>
      </div>
    </article>
  );
}
