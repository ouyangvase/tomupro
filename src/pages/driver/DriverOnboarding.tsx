import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDriverOnboarding } from "@/hooks/useDriverOnboarding";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, ArrowRight, Loader2 } from "lucide-react";
import tomuLogo from "@/assets/tomu-logo.png";

const DriverOnboarding: React.FC = () => {
  const { profile, signOut, signingOut } = useAuth();
  const { linkToRunner } = useDriverOnboarding();
  const [code, setCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return;
    await linkToRunner.mutateAsync(code);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img 
            src={tomuLogo} 
            alt="TOMU Logo" 
            className="mx-auto h-16 w-16 object-contain mb-4" 
          />
          <div className="mx-auto h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Truck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome, {profile?.display_name}!</CardTitle>
          <CardDescription className="text-base mt-2">
            To start receiving deliveries, you need to link your account to a runner.
            Ask your runner for their 6-digit code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="runner-code">Runner Code</Label>
              <Input
                id="runner-code"
                type="text"
                placeholder="Enter 6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground text-center">
                The code should look like: ABC123
              </p>
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={code.trim().length < 4 || linkToRunner.isPending}
            >
              {linkToRunner.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  Link to Runner
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or
                </span>
              </div>
            </div>

            <Button 
              type="button" 
              variant="outline" 
              className="w-full"
              onClick={signOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing out..." : "Sign Out"}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-sm mb-2">Don't have a code?</h4>
            <p className="text-xs text-muted-foreground">
              Contact your runner and ask them to share their runner code with you.
              They can find it in their profile settings.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DriverOnboarding;
