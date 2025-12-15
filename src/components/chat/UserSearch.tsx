import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Search, X, UserSearch as UserSearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  user_id: string;
  username: string;
  email: string;
  bio: string | null;
  profile_image: string | null;
}

interface UserSearchProps {
  onSelectUser: (user: SearchResult) => void;
  onClose: () => void;
}

export default function UserSearch({ onSelectUser, onClose }: UserSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { user } = useAuth();

  const searchUsers = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !user) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, username, email, bio, profile_image')
        .ilike('username', `%${searchQuery}%`)
        .neq('user_id', user.id)
        .limit(10);

      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [user]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchUsers(query);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query, searchUsers]);

  return (
    <div className="absolute inset-0 bg-background z-50 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="h-16 px-5 flex items-center gap-4 border-b border-border">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="p-6 text-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Searching...
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
              <UserSearchIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">User not found</h3>
            <p className="text-sm text-muted-foreground">
              No users matching "{query}"
            </p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="p-2">
            {results.map((result) => (
              <button
                key={result.id}
                onClick={() => onSelectUser(result)}
                className="w-full flex items-center gap-4 p-4 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {result.profile_image ? (
                    <img
                      src={result.profile_image}
                      alt={result.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-primary font-semibold text-lg">
                      {result.username[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {result.username}
                  </p>
                  {result.bio && (
                    <p className="text-sm text-muted-foreground truncate">
                      {result.bio}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {!isSearching && !hasSearched && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">Find people</h3>
            <p className="text-sm text-muted-foreground">
              Search for users by their username
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
