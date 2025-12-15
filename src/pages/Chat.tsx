import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { 
  MessageSquare, 
  Search, 
  Settings, 
  LogOut, 
  Plus
} from 'lucide-react';
import ChatList from '@/components/chat/ChatList';
import ChatWindow from '@/components/chat/ChatWindow';
import UserSearch from '@/components/chat/UserSearch';

interface SelectedChat {
  partnerId: string;
  partnerUsername: string;
  partnerImage: string | null;
}

export default function Chat() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);

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

  const handleSelectConversation = (partnerId: string, partnerUsername: string, partnerImage: string | null) => {
    setSelectedChat({ partnerId, partnerUsername, partnerImage });
  };

  const handleSelectUser = (user: { user_id: string; username: string; profile_image: string | null }) => {
    setSelectedChat({
      partnerId: user.user_id,
      partnerUsername: user.username,
      partnerImage: user.profile_image,
    });
    setShowUserSearch(false);
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
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside className={`w-full md:w-80 bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-amber flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground tracking-tight">BAATCHEET</span>
          </div>
          <button
            onClick={() => setShowUserSearch(true)}
            className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
            title="New chat"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search chats..."
              className="pl-10 bg-sidebar-accent border-sidebar-border"
              onFocus={() => setShowUserSearch(true)}
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto px-2">
          <div className="px-2 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Messages</span>
          </div>
          <ChatList 
            onSelectConversation={handleSelectConversation}
            selectedPartnerId={selectedChat?.partnerId || null}
          />
        </div>

        {/* User Section */}
        <div className="p-4 border-t border-sidebar-border flex-shrink-0">
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

        {/* User Search Overlay */}
        {showUserSearch && (
          <UserSearch 
            onSelectUser={handleSelectUser}
            onClose={() => setShowUserSearch(false)}
          />
        )}
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <ChatWindow
            partnerId={selectedChat.partnerId}
            partnerUsername={selectedChat.partnerUsername}
            partnerImage={selectedChat.partnerImage}
            onBack={() => setSelectedChat(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center mb-6">
              <MessageSquare className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to BAATCHEET</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Select a conversation or search for users to start chatting
            </p>
            <button
              onClick={() => setShowUserSearch(true)}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-md gradient-amber text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Start New Chat
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
