import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import tomuLogo from '@/assets/tomu-logo.png';

import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Only allow user role for self-registration - other roles must be assigned by existing admins
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(100, 'Display name must be less than 100 characters'),
});

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup form
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: result.error.errors[0].message,
      });
      return;
    }
    
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: error.message === 'Invalid login credentials' 
          ? 'Invalid email or password. Please try again.'
          : error.message,
      });
    } else {
      navigate('/');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = signupSchema.safeParse({ 
      email: signupEmail, 
      password: signupPassword, 
      displayName
    });
    
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: result.error.errors[0].message,
      });
      return;
    }
    
    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, displayName, 'user');
    setLoading(false);
    
    if (error) {
      let message = error.message;
      if (error.message.includes('already registered')) {
        message = 'This email is already registered. Please log in instead.';
      }
      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: message,
      });
    } else {
      toast({
        title: 'Account Created',
        description: 'You can now log in with your credentials.',
      });
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-secondary/30 p-4 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-secondary/20 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
      
      {/* Floating accent lines */}
      <div className="absolute top-20 right-20 w-32 h-1 bg-gradient-to-r from-primary/40 to-transparent rounded-full" />
      <div className="absolute bottom-32 left-16 w-24 h-1 bg-gradient-to-r from-transparent to-primary/30 rounded-full" />
      
      <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl">
        {/* Top accent bar */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full" />
        
        <CardHeader className="text-center pt-8 pb-4">
          {/* Logo container with glow */}
          <div className="relative mx-auto mb-6">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-150" />
            <div className="relative p-4 rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 border border-border/50 shadow-lg">
              <img 
                src={tomuLogo} 
                alt="TOMU PRO Logo" 
                className="h-16 w-16 object-contain drop-shadow-lg" 
              />
            </div>
          </div>
          
          {/* Title with gradient */}
          <CardTitle className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
            TOMU PRO
          </CardTitle>
          
          {/* Tagline with separator */}
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-border" />
            <CardDescription className="text-sm font-medium text-muted-foreground/80">
              Orders • Runner • Reconciliation • Inventory
            </CardDescription>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-border" />
          </div>
        </CardHeader>
        
        <CardContent className="pb-8">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 p-1 bg-secondary/50 rounded-xl">
              <TabsTrigger 
                value="login" 
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground transition-all duration-200"
              >
                Login
              </TabsTrigger>
              <TabsTrigger 
                value="signup"
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground transition-all duration-200"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-5 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-medium text-foreground/80">
                    Email
                  </Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-sm font-medium text-foreground/80">
                    Password
                  </Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all duration-300" 
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-5 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="display-name" className="text-sm font-medium text-foreground/80">
                    Display Name
                  </Label>
                  <Input
                    id="display-name"
                    type="text"
                    placeholder="John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-medium text-foreground/80">
                    Email
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                    className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium text-foreground/80">
                    Password
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all duration-300" 
                  disabled={loading}
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        {/* Bottom accent */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent rounded-full" />
      </Card>
    </div>
  );
}
