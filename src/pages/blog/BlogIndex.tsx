import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, Calendar, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  meta_description: string | null;
  published_at: string | null;
  reading_time: number | null;
}

const PAGE_SIZE = 12;
const SORO_EMBED_URL = "https://app.trysoro.com/api/embed/1c1dc78d-226e-4c78-8311-c170ce32643d";
const SORO_SCRIPT_ID = "soro-blog-embed-script";

export default function BlogIndex() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [soroStatus, setSoroStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    document.title = "Blog | TOMUPRO - Logistics & Delivery Insights";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Read our latest articles and insights on logistics, delivery, and eCommerce.");
  }, []);

  const fetchPosts = useCallback(async (from = 0) => {
    try {
      const to = from + PAGE_SIZE - 1;
      const { data, error: err } = await (supabase as any)
        .from("blog_posts")
        .select("id, title, slug, hero_image_url, hero_image_alt, meta_description, published_at, reading_time")
        .order("published_at", { ascending: false })
        .range(from, to);

      if (err) throw err;

      const fetched = data || [];
      setHasMore(fetched.length === PAGE_SIZE);

      if (from === 0) {
        setPosts(fetched);
      } else {
        setPosts((prev) => [...prev, ...fetched]);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load articles");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPosts(0).finally(() => setLoading(false));
  }, [fetchPosts]);

  useEffect(() => {
    const target = document.getElementById("soro-blog");
    if (!target) return;

    target.replaceChildren();
    setSoroStatus("loading");

    const detectContent = () => {
      if (target.querySelector(".soro-blog-list, .soro-blog-article, .soro-blog-empty")) {
        setSoroStatus("ready");
        return true;
      }
      return false;
    };

    const observer = new MutationObserver(detectContent);
    observer.observe(target, { childList: true, subtree: true });

    document.getElementById(SORO_SCRIPT_ID)?.remove();
    const script = document.createElement("script");
    script.id = SORO_SCRIPT_ID;
    script.src = SORO_EMBED_URL;
    script.async = true;
    script.onload = () => detectContent();
    script.onerror = () => setSoroStatus("error");
    target.insertAdjacentElement("afterend", script);

    const timeout = window.setTimeout(() => {
      if (!detectContent()) setSoroStatus("error");
    }, 12_000);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      script.remove();
    };
  }, []);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchPosts(posts.length);
    setLoadingMore(false);
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    fetchPosts(0).finally(() => setLoading(false));
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Hero */}
      <section className="bg-[#0F172A] text-white py-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">TOMUPRO Blog</h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Insights, guides, and best practices for logistics, delivery management,
            and eCommerce operations in Brunei and beyond.
          </p>
        </div>
      </section>

      {/* Articles */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div
            id="soro-blog"
            className={soroStatus === "ready" ? "block" : "hidden"}
            aria-live="polite"
          />

          {/* Loading */}
          {soroStatus === "loading" && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
                  <div className="h-48 bg-gray-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                    <div className="flex gap-4 mt-4">
                      <div className="h-3 bg-gray-200 rounded w-20" />
                      <div className="h-3 bg-gray-200 rounded w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {soroStatus === "error" && !loading && error && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg mb-4">Couldn't load articles. Please try again.</p>
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B8860B] text-white rounded-lg hover:bg-[#9A7209] transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {soroStatus === "error" && !loading && !error && posts.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📝</div>
              <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Articles are on the way!</h2>
              <p className="text-gray-500">Check back soon for the latest insights.</p>
            </div>
          )}

          {/* Supabase fallback */}
          {soroStatus === "error" && !loading && !error && posts.length > 0 && (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/blog/${post.slug}`}
                    className="block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group cursor-pointer"
                  >
                    {post.hero_image_url && (
                      <div className="h-48 overflow-hidden bg-gray-100">
                        <img
                          src={post.hero_image_url}
                          alt={post.hero_image_alt || post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLElement).parentElement!.style.display = "none";
                          }}
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="p-5">
                      <h2 className="text-lg font-bold text-[#0F172A] mb-2 line-clamp-2 group-hover:text-[#B8860B] transition-colors">
                        {post.title}
                      </h2>
                      {post.meta_description && (
                        <p className="text-sm text-[#64748B] leading-relaxed mb-3 line-clamp-3">
                          {post.meta_description.length > 160
                            ? post.meta_description.slice(0, 160) + "..."
                            : post.meta_description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
                        {post.published_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(post.published_at)}
                          </span>
                        )}
                        {post.reading_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {post.reading_time} min read
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="text-center mt-10">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#0F172A] text-white rounded-lg hover:bg-[#1E293B] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {loadingMore ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load More
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Services */}
      <section className="py-12 px-6 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-[#0F172A] mb-4">Explore Our Services</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { path: "/last-mile-delivery-brunei", label: "Last Mile Delivery" },
              { path: "/logistics-company-brunei", label: "Logistics Company Brunei" },
              { path: "/delivery-management-system", label: "Delivery Management System" },
              { path: "/fulfillment-service-brunei", label: "Fulfillment Service" },
              { path: "/logistics-service-brunei", label: "Logistics Service Brunei" },
            ].map((service) => (
              <Link
                key={service.path}
                to={service.path}
                className="inline-block rounded-full border border-gray-200 bg-[#FAFAF9] px-4 py-2 text-sm font-medium text-[#0F172A] hover:border-[#B8860B] hover:text-[#B8860B] transition-colors cursor-pointer"
              >
                {service.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Back */}
      <section className="pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[#B8860B] font-medium hover:underline cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </section>
    </div>
  );
}
