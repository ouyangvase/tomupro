import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Check, ChevronsUpDown, User, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import type { AppRole } from '@/types/database';

interface UserOption {
  id: string;
  display_name: string;
  email: string;
  role: AppRole;
  status: string;
}

export function ImpersonationUserSelect() {
  const [open, setOpen] = useState(false);
  const { startImpersonation, isLoading } = useImpersonation();

  // Fetch all non-admin users
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['impersonation-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, email, role, status')
        .neq('role', 'admin')
        .order('display_name', { ascending: true });

      if (error) throw error;
      return data as UserOption[];
    },
  });

  const handleSelect = async (userId: string) => {
    setOpen(false);
    await startImpersonation(userId);
  };

  const roleColors: Record<string, string> = {
    salesperson: 'bg-blue-500/20 text-blue-400',
    manager: 'bg-purple-500/20 text-purple-400',
    runner: 'bg-green-500/20 text-green-400',
    driver: 'bg-orange-500/20 text-orange-400',
  };

  const statusBadge = (status: string) => {
    if (status === 'active') return null;
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        {status}
      </Badge>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={isLoading || usersLoading}
        >
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Select user to view as...</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or email..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup heading="Users">
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.display_name} ${user.email}`}
                  onSelect={() => handleSelect(user.id)}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.display_name}</span>
                      <Badge 
                        variant="secondary" 
                        className={`${roleColors[user.role] || 'bg-muted'} border-0 text-xs`}
                      >
                        {user.role}
                      </Badge>
                      {statusBadge(user.status)}
                    </div>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
