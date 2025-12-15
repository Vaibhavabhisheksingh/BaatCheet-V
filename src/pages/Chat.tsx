import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  MessageSquare, 
  Search, 
  Settings, 
  LogOut, 
  Send, 
  Users,
  Hash,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';

export default function Chat() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-lg gradient-amber animate-pulse-soft flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-72 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-amber flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground tracking-tight">BAATCHEET</span>
          </div>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search conversations..."
              className="pl-10 bg-sidebar-accent border-sidebar-border"
            />
          </div>
        </div>

        {/* Channels Section */}
        <div className="flex-1 overflow-y-auto px-3">
          <div className="mb-6">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</span>
              <button className="text-muted-foreground hover:text-primary transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {['general', 'random', 'announcements'].map((channel) => (
                <button
                  key={channel}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  <span>{channel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direct Messages</span>
              <button className="text-muted-foreground hover:text-primary transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent transition-colors">
                <Users className="w-4 h-4" />
                <span>Find people to chat</span>
              </button>
            </div>
          </div>
        </div>

        {/* User Section */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {profile?.profile_image ? (
                <img 
                  src={profile.profile_image} 
                  alt={profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary font-semibold">
                  {profile?.username?.[0]?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {profile?.username || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.email}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button 
                className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button 
                onClick={handleSignOut}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-muted"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Chat Header */}
        <header className="h-16 px-6 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <h1 className="font-semibold text-foreground">general</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted">
              <Users className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center mb-6">
              <Hash className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to #general</h2>
            <p className="text-muted-foreground max-w-md">
              This is the start of the #general channel. Send a message to begin the conversation.
            </p>
          </div>
        </div>

        {/* Message Input */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder="Message #general"
              className="flex-1"
            />
            <Button variant="amber" size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
