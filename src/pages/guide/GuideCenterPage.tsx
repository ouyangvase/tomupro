import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAllGuideProgress, useUpdateGuideProgress } from '@/hooks/useGuideCenter';
import {
  guides, faqItems, roleImages, roleDescriptions, onboardingFlows,
  type Guide, type GuideRole, type GuideType
} from '@/data/guideContent';
import {
  Search, BookOpen, Rocket, FileText, HelpCircle, CheckCircle,
  ChevronRight, ArrowRight, Sparkles, GraduationCap, Lightbulb,
  ChevronDown, ChevronUp
} from 'lucide-react';
import capybaraEmpty from '@/assets/capybara-empty.png';

const typeConfig: Record<GuideType, { label: string; icon: React.ReactNode; color: string }> = {
  'overview': { label: 'Overview', icon: <BookOpen className="h-3.5 w-3.5" />, color: 'bg-primary/10 text-primary' },
  'getting-started': { label: 'Getting Started', icon: <Rocket className="h-3.5 w-3.5" />, color: 'bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success))]' },
  'core-task': { label: 'Core Task', icon: <Sparkles className="h-3.5 w-3.5" />, color: 'bg-[hsl(var(--status-warning)/0.1)] text-[hsl(var(--status-warning))]' },
  'page-guide': { label: 'Page Guide', icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-secondary text-secondary-foreground' },
  'example': { label: 'Example', icon: <Lightbulb className="h-3.5 w-3.5" />, color: 'bg-primary/10 text-primary' },
  'faq': { label: 'FAQ', icon: <HelpCircle className="h-3.5 w-3.5" />, color: 'bg-secondary text-secondary-foreground' },
};

export default function GuideCenterPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const { data: progressList = [] } = useAllGuideProgress();
  const updateProgress = useUpdateGuideProgress();

  const role = (profile?.role as GuideRole) || 'salesperson';
  const onboarding = onboardingFlows.find(o => o.role === role);

  const roleGuides = useMemo(() => {
    return guides.filter(g => g.role === role);
  }, [role]);

  const roleFaq = useMemo(() => {
    return faqItems.filter(f => f.roles.includes(role));
  }, [role]);

  const filteredGuides = useMemo(() => {
    let items = roleGuides;
    if (activeTab !== 'all') items = items.filter(g => g.type === activeTab);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(g =>
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.tags.some(t => t.includes(q))
      );
    }
    return items;
  }, [roleGuides, activeTab, searchQuery]);

  const filteredFaq = useMemo(() => {
    if (!searchQuery) return roleFaq;
    const q = searchQuery.toLowerCase();
    return roleFaq.filter(f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
  }, [roleFaq, searchQuery]);

  const completedCount = progressList.filter(p => p.completed).length;
  const totalGuides = roleGuides.length;

  const isCompleted = (guideId: string) => progressList.some(p => p.guide_id === guideId && p.completed);

  const handleOpenGuide = (guide: Guide) => {
    setExpandedGuide(expandedGuide === guide.id ? null : guide.id);
    updateProgress.mutate({ guideId: guide.id, currentStep: 0 });
  };

  const handleCompleteGuide = (guideId: string) => {
    updateProgress.mutate({ guideId, completed: true });
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-card to-primary/10 border p-6 md:p-8">
          <div className="flex items-center gap-6">
            <img src={roleImages[role]} alt={role} className="h-20 w-20 object-contain shrink-0 hidden md:block" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Guide Center</h1>
              </div>
              <p className="text-muted-foreground text-sm">{roleDescriptions[role]}</p>
              <div className="flex items-center gap-4 mt-3">
                <Badge variant="outline" className="text-xs capitalize">{role}</Badge>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-success))]" />
                  {completedCount}/{totalGuides} completed
                </div>
                <div className="h-1.5 w-24 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--status-success))] transition-all"
                    style={{ width: `${totalGuides > 0 ? (completedCount / totalGuides) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search guides, features, pages, questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        {/* Quick Start (if not completed onboarding) */}
        {onboarding && completedCount < 3 && (
          <Card className="border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                Quick Start — First 3 Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-3">
                {onboarding.firstActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card border">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                      {i + 1}
                    </div>
                    <p className="text-sm">{action}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="getting-started" className="text-xs">Getting Started</TabsTrigger>
            <TabsTrigger value="core-task" className="text-xs">Core Tasks</TabsTrigger>
            <TabsTrigger value="page-guide" className="text-xs">Page Guides</TabsTrigger>
            <TabsTrigger value="example" className="text-xs">Examples</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Guides Grid */}
        {filteredGuides.length > 0 ? (
          <div className="space-y-3">
            {filteredGuides.map(guide => {
              const expanded = expandedGuide === guide.id;
              const completed = isCompleted(guide.id);
              const tc = typeConfig[guide.type];

              return (
                <Card
                  key={guide.id}
                  className={cn(
                    "transition-all",
                    completed && "border-[hsl(var(--status-success)/0.3)]",
                    expanded && "ring-1 ring-primary/20"
                  )}
                >
                  <div
                    className="p-4 cursor-pointer flex items-center gap-4"
                    onClick={() => handleOpenGuide(guide)}
                  >
                    <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-secondary">
                      {guide.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-semibold truncate">{guide.title}</h3>
                        {completed && <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-success))] shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{guide.summary}</p>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] gap-1 shrink-0", tc.color)}>
                      {tc.icon}
                      {tc.label}
                    </Badge>
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </div>

                  {expanded && (
                    <CardContent className="pt-0 pb-4 px-4">
                      <div className="border-t pt-4 space-y-3">
                        {guide.steps.map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                                {i + 1}
                              </div>
                              {i < guide.steps.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                            </div>
                            <div className="pb-3">
                              <p className="text-sm font-medium">{step.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                              {step.targetPage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 h-7 text-xs gap-1"
                                  onClick={(e) => { e.stopPropagation(); navigate(step.targetPage!); }}
                                >
                                  <ArrowRight className="h-3 w-3" /> Go to page
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {!completed && (
                          <Button
                            size="sm"
                            className="w-full mt-2"
                            onClick={(e) => { e.stopPropagation(); handleCompleteGuide(guide.id); }}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                            Mark as Completed
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <img src={capybaraEmpty} alt="No results" className="h-24 mx-auto mb-3 opacity-60" />
            <p className="text-sm text-muted-foreground">No guides found for "{searchQuery}"</p>
          </div>
        )}

        {/* FAQ Section */}
        {(activeTab === 'all' || searchQuery) && filteredFaq.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {filteredFaq.map((faq, i) => (
                <div key={i} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full p-3 text-left flex items-center justify-between hover:bg-secondary/50 transition-colors"
                    onClick={() => setExpandedFaq(expandedFaq === `faq-${i}` ? null : `faq-${i}`)}
                  >
                    <span className="text-sm font-medium">{faq.question}</span>
                    {expandedFaq === `faq-${i}` ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {expandedFaq === `faq-${i}` && (
                    <div className="px-3 pb-3 text-sm text-muted-foreground">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
