import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Camera, Save, KeyRound, UserX, Loader2, Shield, Mail, User } from 'lucide-react';
import RunnerCodeCard from '@/components/runner/RunnerCodeCard';
import DriverLinkCard from '@/components/driver/DriverLinkCard';
import { cn } from '@/lib/utils';
import capybaraHero from '@/assets/capybara-hero.png';

const ProfilePage = () => {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'manager': return 'default';
      case 'salesperson': return 'secondary';
      case 'runner': return 'outline';
      default: return 'secondary';
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrator', manager: 'Manager',
      salesperson: 'Salesperson', runner: 'Runner', driver: 'Driver',
    };
    return labels[role] || role;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase.from('profiles').update({ display_name: newName }).eq('id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Display name updated successfully' });
      setIsEditingName(false);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update name', description: error.message, variant: 'destructive' });
    },
  });

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please upload an image file', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 2MB', variant: 'destructive' });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', user.id);
      if (updateError) throw updateError;
      toast({ title: 'Avatar updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (error: any) {
      toast({ title: 'Failed to upload avatar', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password too short', description: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated successfully' });
      setShowPasswordForm(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({ title: 'Failed to update password', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeactivateAccount = async () => {
    if (!user) return;
    try {
      const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', user.id);
      if (error) throw error;
      toast({ title: 'Account deactivated' });
      await signOut();
    } catch (error: any) {
      toast({ title: 'Failed to deactivate account', description: error.message, variant: 'destructive' });
    }
  };

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Profile Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border border-primary/20 p-8">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-[hsl(var(--status-success)/0.08)] rounded-full blur-2xl" />
          
          <div className="relative flex items-center gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <Avatar className="h-24 w-24 ring-4 ring-primary/20 shadow-lg">
                <AvatarImage src={profile.avatar_url || ''} alt={profile.display_name} />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                  {getInitials(profile.display_name)}
                </AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="secondary"
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md border-2 border-background"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{profile.display_name}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <Mail className="h-3.5 w-3.5" />
                {profile.email}
              </p>
              <Badge variant={getRoleBadgeVariant(profile.role)} className="mt-2">
                {getRoleLabel(profile.role)}
              </Badge>
            </div>

            {/* Capybara */}
            <div className="hidden md:block shrink-0">
              <img src={capybaraHero} alt="Capybara" className="h-20 w-20 object-contain drop-shadow-lg opacity-80" />
            </div>
          </div>
        </div>

        {/* Welcome message for new users */}
        {profile.role === 'user' && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-primary">Welcome to TOMU PRO!</CardTitle>
              <CardDescription>
                Complete your profile setup below. Once an administrator assigns you a role, you'll gain access to more features.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Upload a profile photo to personalize your account</li>
                <li>Update your display name</li>
                <li>Set a secure password</li>
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile Information
            </CardTitle>
            <CardDescription>Update your display name</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              {isEditingName ? (
                <div className="flex gap-2">
                  <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Enter display name" />
                  <Button onClick={() => updateNameMutation.mutate(displayName)} disabled={updateNameMutation.isPending || !displayName.trim()}>
                    {updateNameMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" onClick={() => { setIsEditingName(false); setDisplayName(profile.display_name); }}>Cancel</Button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <Input value={profile.display_name} disabled className="bg-muted" />
                  <Button variant="outline" onClick={() => setIsEditingName(true)}>Edit</Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile.email} disabled className="bg-muted" />
            </div>
          </CardContent>
        </Card>

        {profile.role === 'runner' && <RunnerCodeCard />}
        {profile.role === 'driver' && <DriverLinkCard />}

        {/* Security Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Security
            </CardTitle>
            <CardDescription>Manage your password and account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showPasswordForm ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleChangePassword} disabled={!newPassword || !confirmPassword}>Update Password</Button>
                  <Button variant="outline" onClick={() => { setShowPasswordForm(false); setNewPassword(''); setConfirmPassword(''); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
                <KeyRound className="h-4 w-4 mr-2" />
                Change Password
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        {profile.role !== 'salesperson' && profile.role !== 'manager' && (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions for your account</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <UserX className="h-4 w-4 mr-2" />
                    Deactivate Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will deactivate your account. You will be signed out immediately and will no longer be able to access the application. Contact an administrator to reactivate your account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeactivateAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Deactivate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default ProfilePage;
