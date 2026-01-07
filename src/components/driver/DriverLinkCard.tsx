import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDriverOnboarding } from "@/hooks/useDriverOnboarding";
import { useDriverParentRunner } from "@/hooks/useDrivers";
import { Link2, Loader2, CheckCircle2 } from "lucide-react";

const DriverLinkCard: React.FC = () => {
  const { linkToRunner, isLinked } = useDriverOnboarding();
  const { data: parentRunner } = useDriverParentRunner();
  const [code, setCode] = useState("");
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return;
    await linkToRunner.mutateAsync(code);
    setCode("");
    setShowForm(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Runner Link
        </CardTitle>
        <CardDescription>
          Link your account to a runner to receive delivery assignments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLinked && parentRunner ? (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">Linked to Runner</p>
              <Badge variant="outline">{parentRunner.display_name}</Badge>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Not linked to any runner yet.
            </p>
          </div>
        )}

        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="runner-code">Runner Code</Label>
              <Input
                id="runner-code"
                type="text"
                placeholder="Enter 6-digit code (e.g., ABC123)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                className="text-center text-lg tracking-widest font-mono"
                maxLength={6}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={code.trim().length < 4 || linkToRunner.isPending}
                className="flex-1"
              >
                {linkToRunner.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Linking...
                  </>
                ) : (
                  "Link to Runner"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setCode("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            onClick={() => setShowForm(true)}
            className="w-full"
          >
            <Link2 className="h-4 w-4 mr-2" />
            {isLinked ? "Re-link to Different Runner" : "Link to Runner by Code"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default DriverLinkCard;
