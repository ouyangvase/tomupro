import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { guides, pageGuides, roleImages, type GuideRole } from '@/data/guideContent';
import { Search, BookOpen, ArrowRight, HelpCircle, ChevronRight, Sparkles } from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';

export function FloatingHelpButton() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const role = (profile?.role as GuideRole) || 'salesperson';

  const currentPageGuide = pageGuides[location.pathname];

  const searchResults = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return guides
      .filter(g => g.role === role)
      .filter(g =>
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.tags.some(t => t.includes(q))
      )
      .slice(0, 5);
  }, [search, role]);

  const topGuides = useMemo(() => {
    return guides
      .filter(g => g.role === role && (g.type === 'getting-started' || g.type === 'core-task'))
      .slice(0, 4);
  }, [role]);

  if (!profile) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className={cn(
            "fixed bottom-20 right-4 z-40",
            "h-10 w-10 rounded-full shadow-md",
            "bg-primary/80 hover:bg-primary text-primary-foreground",
            "flex items-center justify-center",
            "transition-all hover:scale-105 active:scale-95",
            "md:bottom-6 md:right-6 md:h-11 md:w-11"
          )}
          aria-label="Need Help?"
        >
          <AppLogo size="xs" />
        </button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px] p-0">
        <SheetHeader className="p-5 pb-3 border-b">
          <div className="flex items-center gap-3">
            <img src={roleImages[role]} alt={role} className="h-10 w-10 object-contain" />
            <div>
              <SheetTitle className="text-base">Need Help?</SheetTitle>
              <p className="text-xs text-muted-foreground capitalize">{role} guide center</p>
            </div>
          </div>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search guides..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-4">
              {/* Search Results */}
              {search && searchResults.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Results</p>
                  {searchResults.map(guide => (
                    <button
                      key={guide.id}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                      onClick={() => { setOpen(false); navigate('/guide'); }}
                    >
                      <span className="text-lg">{guide.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{guide.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{guide.summary}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {search && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No guides found</p>
              )}

              {!search && (
                <>
                  {/* Current Page Guide */}
                  {currentPageGuide && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">This Page</p>
                      <div className="p-3 rounded-lg border bg-primary/[0.02]">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-3.5 w-3.5 text-primary" />
                          <p className="text-sm font-semibold">{currentPageGuide.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{currentPageGuide.description}</p>
                        {currentPageGuide.guideId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs gap-1"
                            onClick={() => { setOpen(false); navigate('/guide'); }}
                          >
                            <ArrowRight className="h-3 w-3" /> View full guide
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Top Guides */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Top Guides</p>
                    {topGuides.map(guide => (
                      <button
                        key={guide.id}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                        onClick={() => { setOpen(false); navigate('/guide'); }}
                      >
                        <span className="text-lg">{guide.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{guide.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{guide.summary}</p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Quick Actions</p>
                    <button
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                      onClick={() => { setOpen(false); navigate('/guide'); }}
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Open Guide Center</p>
                        <p className="text-[11px] text-muted-foreground">Browse all guides for your role</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
