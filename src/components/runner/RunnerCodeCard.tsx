import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDriverOnboarding } from "@/hooks/useDriverOnboarding";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

const RunnerCodeCard: React.FC = () => {
  const { runnerCode } = useDriverOnboarding();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!runnerCode) return;
    
    try {
      await navigator.clipboard.writeText(runnerCode);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  if (!runnerCode) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Your Runner Code</CardTitle>
        <CardDescription className="text-xs">
          Share this code with drivers to let them link to you
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Badge 
            variant="secondary" 
            className="text-xl font-mono tracking-widest px-4 py-2"
          >
            {runnerCode}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RunnerCodeCard;
