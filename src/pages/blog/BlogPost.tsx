import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, Calendar, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ---------- placeholder ---------- */
interface BlogPost {
  id: number;
  title: string;
  slug: string;
  content_html: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  infographic_url: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  faq_schema: { question: string; answer: string }[] | null;
  published_at: string | null;
  updated_at: string | null;
  reading_time: number | null;
}

interface RelatedPost {
  id: number;
  title: string;
  slug: string;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  published_at: string | null;
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<RelatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Fetch post
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);

    (async () => {
      const { data, error } = await (supabase as any)
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPost(data);
      setLoading(false);

      // Fetch related
      const { data: rel } = await (supabase as any)
        .from("blog_posts")
        .select("id, title, slug, hero_image_url, hero_image_alt, published_at")
        .neq("slug", slug)
        .order("published_at", { ascending: false })
        .limit(3);
      setRelated(rel || []);
    })();
  }, [slug]);

  // SEO meta tags
  useEffect(() => {
    if (!post) return;
    document.title = `${post.title} | TOMUPRO Blog`;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, name); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    const desc = post.meta_description || (post.content_html?.replace(/<[^>]*>/g, "").slice(0, 160) + "...") || "";
    setMeta("description", desc);
    if (post.meta_keywords) setMeta("keywords", post.meta_keywords);
    setMeta("og:title", post.title, "property");
    setMeta("og:description", desc, "property");
    setMeta("og:type", "article", "property");
    setMeta("og:url", `https://tomu.my/blog/${post.slug}`, "property");
    if (post.hero_image_url) setMeta("og:image", post.hero_image_url, "property");
    setMeta("twitter:card", "summary_large_image", "name");
    setMeta("twitter:title", post.title, "name");
    setMeta("twitter:description", desc, "name");
    if (post.hero_image_url) setMeta("twitter:image", post.hero_image_url, "name");

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = `https://tomu.my/blog/${post.slug}`;

    // Article JSON-LD
    const articleLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      image: post.hero_image_url || undefined,
      datePublished: post.published_at,
      dateModified: post.updated_at || post.published_at,
      description: desc,
      publisher: { "@type": "Organization", name: "TOMUPRO", url: "https://tomu.my" },
    };
    let scriptEl = document.getElementById("article-jsonld");
    if (!scriptEl) { scriptEl = document.createElement("script"); scriptEl.id = "article-jsonld"; scriptEl.setAttribute("type", "application/ld+json"); document.head.appendChild(scriptEl); }
    scriptEl.textContent = JSON.stringify(articleLd);

    // FAQ JSON-LD
    if (post.faq_schema && post.faq_schema.length > 0) {
      const faqLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq_schema.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      };
      let faqScript = document.getElementById("faq-jsonld");
      if (!faqScript) { faqScript = document.createElement("script"); faqScript.id = "faq-jsonld"; faqScript.setAttribute("type", "application/ld+json"); document.head.appendChild(faqScript); }
      faqScript.textContent = JSON.stringify(faqLd);
    }

    return () => {
      document.getElementById("article-jsonld")?.remove();
      document.getElementById("faq-jsonld")?.remove();
    };
  }, [post]);

  const formatDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9]">
        <div className="bg-[#0F172A] py-16 px-6">
          <div className="max-w-3xl mx-auto animate-pulse">
            <div className="h-4 bg-gray-600 rounded w-32 mb-6" />
            <div className="h-8 bg-gray-600 rounded w-3/4 mb-4" />
            <div className="h-4 bg-gray-600 rounded w-48" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-6 py-16 animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  // 404
  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-[#0F172A] mb-2">Article Not Found</h1>
          <p className="text-gray-500 mb-6">The article you're looking for doesn't exist or has been removed.</p>
          <Link to="/blog" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B8860B] text-white rounded-lg hover:bg-[#9A7209] transition-colors cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
            Back to all articles
          </Link>
        </div>
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <section className="bg-[#0F172A] text-white py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <Link to="/blog" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors cursor-pointer">
            <ArrowLeft className="h-4 w-4" /> Back to all articles
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{post.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            {post.published_at && (
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{formatDate(post.published_at)}</span>
            )}
            {post.reading_time && (
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{post.reading_time} min read</span>
            )}
          </div>
        </div>
      </section>

      {/* Hero Image */}
      {post.hero_image_url && (
        <div className="max-w-4xl mx-auto px-6 -mt-6">
          <img
            src={post.hero_image_url}
            alt={post.hero_image_alt || post.title}
            className="w-full max-h-[400px] object-cover rounded-xl shadow-lg"
            onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }}
          />
        </div>
      )}

      {/* Content */}
      <section className="py-12 px-6">
        <div
          className="max-w-3xl mx-auto blog-prose"
          dangerouslySetInnerHTML={{ __html: post.content_html || "" }}
        />
      </section>

      {/* Infographic */}
      {post.infographic_url && (
        <section className="px-6 pb-8">
          <div className="max-w-3xl mx-auto">
            <img
              src={post.infographic_url}
              alt="Infographic"
              className="w-full rounded-xl border border-gray-200 shadow-sm"
              onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }}
              loading="lazy"
            />
          </div>
        </section>
      )}

      {/* FAQ */}
      {post.faq_schema && post.faq_schema.length > 0 && (
        <section className="px-6 pb-12">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F172A] mb-6">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {post.faq_schema.map((faq, i) => (
                <FaqItem key={i} question={faq.question} answer={faq.answer} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related Articles */}
      {related.length > 0 && (
        <section className="py-12 px-6 bg-white border-t border-gray-100">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-bold text-[#0F172A] mb-6">Related Articles</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link key={r.id} to={`/blog/${r.slug}`} className="block rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer">
                  {r.hero_image_url && (
                    <div className="h-32 overflow-hidden bg-gray-100">
                      <img src={r.hero_image_url} alt={r.hero_image_alt || r.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }} loading="lazy" />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-[#0F172A] group-hover:text-[#B8860B] transition-colors line-clamp-2 mb-1">{r.title}</h3>
                    <span className="text-xs text-[#94A3B8]">{formatDate(r.published_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related Services */}
      <section className="py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-[#0F172A] mb-6">Related Services</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { path: "/last-mile-delivery-brunei", label: "Last Mile Delivery Brunei" },
              { path: "/logistics-company-brunei", label: "Logistics Company Brunei" },
              { path: "/delivery-management-system", label: "Delivery Management System" },
              { path: "/fulfillment-service-brunei", label: "Fulfillment Service Brunei" },
            ].map((s) => (
              <Link key={s.path} to={s.path} className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-[#B8860B]/30 transition-all group cursor-pointer">
                <span className="text-sm font-medium text-[#0F172A] group-hover:text-[#B8860B] transition-colors">{s.label}</span>
                <ArrowRight className="h-4 w-4 text-[#94A3B8] group-hover:text-[#B8860B] transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Back */}
      <section className="pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <Link to="/blog" className="inline-flex items-center gap-2 text-[#B8860B] font-medium hover:underline cursor-pointer">
            <ArrowLeft className="h-4 w-4" /> Back to all articles
          </Link>
        </div>
      </section>

      {/* Blog prose styles */}
      <style>{`
        .blog-prose { font-size: 1.05rem; line-height: 1.75; color: #374151; }
        .blog-prose h2 { font-size: 1.5rem; font-weight: 700; margin-top: 1.75rem; margin-bottom: 0.75rem; color: #0F172A; }
        .blog-prose h3 { font-size: 1.25rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #0F172A; }
        .blog-prose p { margin-bottom: 1rem; color: #374151; }
        .blog-prose ul, .blog-prose ol { margin-bottom: 1rem; padding-left: 1.5rem; }
        .blog-prose ul { list-style-type: disc; }
        .blog-prose ol { list-style-type: decimal; }
        .blog-prose li { margin-bottom: 0.5rem; color: #374151; }
        .blog-prose blockquote { border-left: 4px solid #B8860B; padding-left: 1rem; font-style: italic; color: #64748B; margin: 1rem 0; }
        .blog-prose code { background: #F1F5F9; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        .blog-prose pre { background: #1E293B; color: #E2E8F0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 1rem 0; }
        .blog-prose pre code { background: transparent; padding: 0; color: inherit; }
        .blog-prose table { width: 100%; border-collapse: collapse; margin: 1rem 0; overflow-x: auto; display: block; }
        .blog-prose th, .blog-prose td { border: 1px solid #E2E8F0; padding: 0.5rem 0.75rem; text-align: left; }
        .blog-prose tr:nth-child(even) { background: #F8FAFC; }
        .blog-prose th { background: #F1F5F9; font-weight: 600; }
        .blog-prose img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1rem auto; display: block; }
        .blog-prose a { color: #2563EB; text-decoration: none; }
        .blog-prose a:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

/* ---------- FAQ Accordion Item ---------- */
function FaqItem({ question, answer, defaultOpen }: { question: string; answer: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <span className="font-semibold text-[#0F172A] pr-4">{question}</span>
        <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "500px" : "0", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-4 text-[#64748B] leading-relaxed">{answer}</div>
      </div>
    </div>
  );
}
