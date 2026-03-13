import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { validateInviteCode } from '@/hooks/useInviteCodes';
import { supabase } from '@/integrations/supabase/client';
import capybaraHero from '@/assets/capybara-hero.png';
import { Ticket, Package, MapPin, BarChart3, Truck } from 'lucide-react';

import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(100, 'Display name must be less than 100 characters'),
});

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Validation Error', description: result.error.errors[0].message });
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
    
    const result = signupSchema.safeParse({ email: signupEmail, password: signupPassword, displayName });
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Validation Error', description: result.error.errors[0].message });
      return;
    }
    
    setLoading(true);
    
    let assignedRole: 'user' | 'salesperson' | 'runner' | 'driver' = 'driver';
    
    if (inviteCode.trim()) {
      setCodeStatus('validating');
      const validatedRole = await validateInviteCode(inviteCode.trim());
      
      if (validatedRole) {
        assignedRole = validatedRole as 'salesperson' | 'runner' | 'driver';
        setCodeStatus('valid');
        toast({ title: 'Code Applied', description: `Role assigned: ${assignedRole.charAt(0).toUpperCase() + assignedRole.slice(1)}` });
      } else {
        setCodeStatus('invalid');
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The invite code is invalid or expired. You will be registered as a Driver.' });
      }
    }
    
    const { error } = await signUp(signupEmail, signupPassword, displayName, assignedRole);
    setLoading(false);
    
    if (error) {
      let message = error.message;
      if (error.message.includes('already registered')) {
        message = 'This email is already registered. Please log in instead.';
      }
      toast({ variant: 'destructive', title: 'Signup Failed', description: message });
    } else {
      const roleDescription = assignedRole === 'salesperson' 
        ? "Welcome! You've been registered as a Salesperson."
        : assignedRole === 'driver'
          ? "Welcome! You've been registered as a Driver. Please link to your runner to continue."
          : `Welcome! You've been registered as a ${assignedRole}.`;
      
      toast({ title: 'Account Created', description: roleDescription });
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[hsl(36,33%,96%)] via-[hsl(36,25%,93%)] to-[hsl(28,20%,90%)] dark:from-[hsl(25,12%,8%)] dark:via-[hsl(25,10%,10%)] dark:to-[hsl(25,12%,8%)] relative overflow-hidden">
      {/* Warm decorative blobs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[100px] -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-primary/6 rounded-full blur-[80px] translate-x-1/4 translate-y-1/4" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-[hsl(var(--status-success)/0.05)] rounded-full blur-[60px]" />
      
      {/* Left Hero Panel — Hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col items-center justify-center p-12">
        {/* Floating feature pills */}
        <div className="absolute top-12 left-12 flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm animate-fade-in">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground/80">Order Tracking</span>
        </div>
        <div className="absolute top-12 right-16 flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <MapPin className="h-4 w-4 text-[hsl(var(--status-success))]" />
          <span className="text-sm font-medium text-foreground/80">Live Routes</span>
        </div>
        <div className="absolute bottom-24 left-16 flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <BarChart3 className="h-4 w-4 text-[hsl(var(--status-pending))]" />
          <span className="text-sm font-medium text-foreground/80">Analytics</span>
        </div>
        <div className="absolute bottom-36 right-20 flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <Truck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground/80">Fleet Management</span>
        </div>

        {/* Hero illustration */}
        <div className="relative z-10 text-center max-w-lg">
          <img
            src={capybaraHero}
            alt="TOMUPRO Capybara Mascot"
            className="w-64 h-64 xl:w-80 xl:h-80 object-contain mx-auto drop-shadow-2xl mb-8"
          />
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            TOMU<span className="text-primary">PRO</span>
          </h1>
          <p className="text-lg text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed">
            Calm, capable logistics operations. Every parcel has a path, every operator has a guide.
          </p>
          
          {/* Trust indicators */}
          <div className="flex items-center justify-center gap-6 mt-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">24/7</p>
              <p className="text-xs text-muted-foreground">Operations</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">5+</p>
              <p className="text-xs text-muted-foreground">Roles</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">Real-time</p>
              <p className="text-xs text-muted-foreground">Tracking</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Login Panel */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 lg:p-12">
        <Card className="w-full max-w-md relative z-10 border-border/40 bg-card/90 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pt-8 pb-4">
            {/* Mobile-only logo */}
            <div className="mx-auto mb-4 lg:hidden">
              <img
                src={capybaraHero}
                alt="TOMUPRO"
                className="h-20 w-20 object-contain drop-shadow-lg"
              />
            </div>
            
            <CardTitle className="text-3xl font-extrabold tracking-tight">
              TOMU<span className="text-primary">PRO</span>
            </CardTitle>
            
            <div className="flex items-center justify-center gap-3 mt-3">
              <div className="h-px w-8 bg-gradient-to-r from-transparent to-border" />
              <CardDescription className="text-sm font-medium text-muted-foreground/80">
                Operations • Delivery • Inventory
              </CardDescription>
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-border" />
            </div>
          </CardHeader>
          
          <CardContent className="pb-8">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 p-1 bg-secondary/50 rounded-xl">
                <TabsTrigger 
                  value="login" 
                  className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:text-foreground transition-all duration-200"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger 
                  value="signup"
                  className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:text-foreground transition-all duration-200"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-5 mt-6">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm font-medium text-foreground/80">Email</Label>
                    <Input id="login-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm font-medium text-foreground/80">Password</Label>
                    <Input id="login-password" type="password" placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl" />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-[hsl(28,67%,45%)] hover:from-[hsl(28,67%,45%)] hover:to-primary shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all duration-300" 
                    disabled={loading}
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-5 mt-6">
                  <div className="space-y-2">
                    <Label htmlFor="display-name" className="text-sm font-medium text-foreground/80">Display Name</Label>
                    <Input id="display-name" type="text" placeholder="John Doe" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm font-medium text-foreground/80">Email</Label>
                    <Input id="signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-medium text-foreground/80">Password</Label>
                    <Input id="signup-password" type="password" placeholder="••••••••" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-code" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                      <Ticket className="h-4 w-4" />
                      Admin Code
                      <span className="text-xs text-muted-foreground">(Optional)</span>
                    </Label>
                    <Input
                      id="invite-code"
                      type="text"
                      placeholder="TOMU-SP-XXXX"
                      value={inviteCode}
                      onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setCodeStatus('idle'); }}
                      className={`h-12 bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 font-mono uppercase rounded-xl ${
                        codeStatus === 'valid' ? 'border-[hsl(var(--status-success))] bg-[hsl(var(--status-success)/0.08)]' :
                        codeStatus === 'invalid' ? 'border-destructive bg-destructive/8' : ''
                      }`}
                    />
                    {codeStatus === 'valid' && (
                      <p className="text-xs text-[hsl(var(--status-success))]">✓ Valid code — role will be assigned</p>
                    )}
                    {codeStatus === 'invalid' && (
                      <p className="text-xs text-destructive">✗ Invalid or expired code</p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-[hsl(28,67%,45%)] hover:from-[hsl(28,67%,45%)] hover:to-primary shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all duration-300" 
                    disabled={loading}
                  >
                    {loading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}