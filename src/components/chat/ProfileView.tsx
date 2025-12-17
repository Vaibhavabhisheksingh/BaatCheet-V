import { useState } from 'react';
import { X, Camera, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

interface ProfileViewProps {
  profile: {
    user_id: string;
    username: string;
    email: string;
    bio: string | null;
    profile_image: string | null;
    last_seen?: string | null;
  };
  isOwnProfile: boolean;
  onClose: () => void;
}

export default function ProfileView({ profile, isOwnProfile, onClose }: ProfileViewProps) {
  const { updateProfile, uploadAvatar } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState(profile.bio || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    const { error } = await updateProfile({ bio });
    setIsLoading(false);

    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated');
      setIsEditing(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setIsUploadingAvatar(true);
    const { error } = await uploadAvatar(file);
    setIsUploadingAvatar(false);

    if (error) {
      toast.error('Failed to upload avatar');
    } else {
      toast.success('Avatar updated');
    }
  };

  const getLastSeenText = () => {
    if (!profile.last_seen) return 'Unknown';
    const lastSeen = new Date(profile.last_seen);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    
    if (diffMinutes < 5) return 'Online';
    return `Last seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="relative h-24 gradient-amber">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-background/20 hover:bg-background/40 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        {/* Avatar */}
        <div className="relative -mt-12 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-lg bg-muted border-4 border-card flex items-center justify-center overflow-hidden">
              {profile.profile_image ? (
                <img
                  src={profile.profile_image}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-primary">
                  {profile.username[0]?.toUpperCase()}
                </span>
              )}
            </div>
            {isOwnProfile && (
              <label className="absolute -bottom-1 -right-1 p-2 bg-primary rounded-full cursor-pointer hover:opacity-90 transition-opacity">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={isUploadingAvatar}
                />
                {isUploadingAvatar ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-primary-foreground" />
                )}
              </label>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 pt-4 space-y-4">
          {/* Username & Status */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">{profile.username}</h2>
            <p className={cn(
              "text-sm",
              getLastSeenText() === 'Online' ? "text-green-500" : "text-muted-foreground"
            )}>
              {getLastSeenText()}
            </p>
          </div>

          {/* Email (only for own profile) */}
          {isOwnProfile && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </label>
              <Input value={profile.email} disabled className="bg-muted" />
            </div>
          )}

          {/* Bio */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Bio
            </label>
            {isOwnProfile && isEditing ? (
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                className="resize-none"
                rows={3}
                maxLength={200}
              />
            ) : (
              <p className="text-sm text-foreground p-3 bg-muted rounded-md min-h-[60px]">
                {profile.bio || 'No bio yet'}
              </p>
            )}
          </div>

          {/* Actions */}
          {isOwnProfile && (
            <div className="flex gap-2 pt-2">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIsEditing(false);
                      setBio(profile.bio || '');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="amber"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsEditing(true)}
                >
                  Edit Profile
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
