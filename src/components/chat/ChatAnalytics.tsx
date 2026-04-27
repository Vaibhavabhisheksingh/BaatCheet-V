import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  Trophy,
  Clock,
  Flame,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  MessageSquare,
  Timer,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { format, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface ChatAnalyticsProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  partnerId: string;
  partnerUsername: string;
  selfUsername?: string;
}

interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
}

type Bucket = 'morning' | 'afternoon' | 'evening' | 'night';

const SESSION_GAP_MINUTES = 30;
const STREAK_DAY_GAP_MS = 1000 * 60 * 60 * 24;

function dayKey(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function bucketForHour(hour: number): Bucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const BUCKET_META: Record<Bucket, { label: string; range: string; Icon: typeof Sun }> = {
  morning:   { label: 'Morning',   range: '5am – 12pm', Icon: Sunrise },
  afternoon: { label: 'Afternoon', range: '12pm – 5pm',  Icon: Sun },
  evening:   { label: 'Evening',   range: '5pm – 9pm',   Icon: Sunset },
  night:     { label: 'Night',     range: '9pm – 5am',   Icon: Moon },
};

export default function ChatAnalytics({
  open,
  onClose,
  userId,
  partnerId,
  partnerUsername,
  selfUsername = 'You',
}: ChatAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, created_at')
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`
        )
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('Analytics fetch failed', error);
        setMessages([]);
      } else {
        setMessages((data as MessageRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId, partnerId]);

  const stats = useMemo(() => {
    const total = messages.length;
    const selfCount = messages.filter((m) => m.sender_id === userId).length;
    const partnerCount = total - selfCount;
    const selfPct = total ? Math.round((selfCount / total) * 100) : 0;
    const partnerPct = total ? 100 - selfPct : 0;

    // Per-day series
    const perDayMap = new Map<string, { date: string; self: number; partner: number }>();
    for (const m of messages) {
      const k = dayKey(new Date(m.created_at));
      const row = perDayMap.get(k) ?? { date: k, self: 0, partner: 0 };
      if (m.sender_id === userId) row.self += 1;
      else row.partner += 1;
      perDayMap.set(k, row);
    }
    const perDay = Array.from(perDayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const perDayChart = perDay.slice(-30).map((d) => ({
      ...d,
      label: format(new Date(d.date), 'MMM d'),
    }));

    // Average response time (only when sender flips). Cap at 24h to ignore overnight gaps.
    const selfReplyDeltas: number[] = [];
    const partnerReplyDeltas: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const cur = messages[i];
      if (prev.sender_id === cur.sender_id) continue;
      const delta = differenceInSeconds(new Date(cur.created_at), new Date(prev.created_at));
      if (delta < 0 || delta > 60 * 60 * 24) continue;
      if (cur.sender_id === userId) selfReplyDeltas.push(delta);
      else partnerReplyDeltas.push(delta);
    }
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0;
    const selfAvgReply = avg(selfReplyDeltas);
    const partnerAvgReply = avg(partnerReplyDeltas);

    // "Faster than X% of users" — playful percentile vs. partner only.
    let fasterPct = 50;
    if (selfReplyDeltas.length && partnerReplyDeltas.length) {
      const faster = partnerReplyDeltas.filter((d) => d > selfAvgReply).length;
      fasterPct = Math.round((faster / partnerReplyDeltas.length) * 100);
    }

    // Conversation streak — consecutive days where BOTH users sent at least one message.
    const bothDays = new Set<string>();
    const selfDays = new Set<string>();
    const partnerDays = new Set<string>();
    for (const m of messages) {
      const k = dayKey(new Date(m.created_at));
      if (m.sender_id === userId) selfDays.add(k);
      else partnerDays.add(k);
    }
    selfDays.forEach((d) => {
      if (partnerDays.has(d)) bothDays.add(d);
    });
    const sortedBoth = Array.from(bothDays).sort();
    let currentStreak = 0;
    let bestStreak = 0;
    let prevTs: number | null = null;
    let runningStreak = 0;
    for (const d of sortedBoth) {
      const ts = new Date(d).getTime();
      if (prevTs !== null && ts - prevTs === STREAK_DAY_GAP_MS) {
        runningStreak += 1;
      } else {
        runningStreak = 1;
      }
      bestStreak = Math.max(bestStreak, runningStreak);
      prevTs = ts;
    }
    // Current streak: only counts if last "both" day is today or yesterday
    if (sortedBoth.length) {
      const lastTs = new Date(sortedBoth[sortedBoth.length - 1]).getTime();
      const todayKey = dayKey(new Date());
      const yKey = dayKey(new Date(Date.now() - STREAK_DAY_GAP_MS));
      const lastKey = sortedBoth[sortedBoth.length - 1];
      if (lastKey === todayKey || lastKey === yKey) {
        let s = 1;
        let cursor = lastTs;
        for (let i = sortedBoth.length - 2; i >= 0; i--) {
          const t = new Date(sortedBoth[i]).getTime();
          if (cursor - t === STREAK_DAY_GAP_MS) {
            s += 1;
            cursor = t;
          } else break;
        }
        currentStreak = s;
      }
    }

    // Most active time of day
    const buckets: Record<Bucket, number> = {
      morning: 0, afternoon: 0, evening: 0, night: 0,
    };
    for (const m of messages) {
      buckets[bucketForHour(new Date(m.created_at).getHours())] += 1;
    }
    const peakBucket = (Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      'evening') as Bucket;
    const peakBucketCount = buckets[peakBucket];

    // Longest continuous chat session (gap > SESSION_GAP_MINUTES breaks the session)
    let longestSession = { count: 0, start: '', end: '', durationMin: 0 };
    let curStart = 0;
    let curCount = 0;
    let curStartTs = 0;
    let curLastTs = 0;
    for (let i = 0; i < messages.length; i++) {
      const ts = new Date(messages[i].created_at).getTime();
      if (i === 0 || differenceInMinutes(ts, curLastTs) > SESSION_GAP_MINUTES) {
        curStart = i;
        curStartTs = ts;
        curCount = 1;
      } else {
        curCount += 1;
      }
      curLastTs = ts;
      if (curCount > longestSession.count) {
        longestSession = {
          count: curCount,
          start: new Date(curStartTs).toISOString(),
          end: new Date(curLastTs).toISOString(),
          durationMin: Math.max(1, Math.round((curLastTs - curStartTs) / 60000)),
        };
      }
    }

    return {
      total,
      selfCount,
      partnerCount,
      selfPct,
      partnerPct,
      perDayChart,
      selfAvgReply,
      partnerAvgReply,
      fasterPct,
      currentStreak,
      bestStreak,
      buckets,
      peakBucket,
      peakBucketCount,
      longestSession,
    };
  }, [messages, userId]);

  const mostActive: 'self' | 'partner' | 'tie' =
    stats.selfCount === stats.partnerCount
      ? 'tie'
      : stats.selfCount > stats.partnerCount
      ? 'self'
      : 'partner';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Chat Analytics
          </DialogTitle>
          <DialogDescription>
            Activity and behavior insights for your conversation with {partnerUsername}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <AnalyticsSkeleton />
        ) : stats.total === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 mt-2">
            {/* Contribution */}
            <Card>
              <CardContent className="p-5">
                <SectionTitle icon={MessageSquare} title="Message contribution" />
                <div className="mt-3 space-y-3">
                  <ContributionRow
                    name={selfUsername}
                    pct={stats.selfPct}
                    count={stats.selfCount}
                    accent="primary"
                    badge={mostActive === 'self' ? 'Most Active' : undefined}
                  />
                  <ContributionRow
                    name={partnerUsername}
                    pct={stats.partnerPct}
                    count={stats.partnerCount}
                    accent="muted"
                    badge={mostActive === 'partner' ? 'Most Active' : undefined}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  {stats.total} total messages
                  {mostActive === 'tie' && ' • Both equally active'}
                </p>
              </CardContent>
            </Card>

            {/* Per-day chart */}
            <Card>
              <CardContent className="p-5">
                <SectionTitle icon={BarChart3} title="Messages per day" subtitle="Last 30 active days" />
                <div className="h-56 mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.perDayChart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        stroke="hsl(var(--border))"
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="self"
                        name={selfUsername}
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="partner"
                        name={partnerUsername}
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <LegendDot color="hsl(var(--primary))" /> {selfUsername}
                  <LegendDot color="hsl(var(--muted-foreground))" /> {partnerUsername}
                </div>
              </CardContent>
            </Card>

            {/* Response time + streak */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <SectionTitle icon={Clock} title="Average response time" />
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{selfUsername}</span>
                      <span className="font-medium">{formatDuration(stats.selfAvgReply)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{partnerUsername}</span>
                      <span className="font-medium">{formatDuration(stats.partnerAvgReply)}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-primary">
                    You reply faster than {stats.fasterPct}% of {partnerUsername}'s replies.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <SectionTitle icon={Flame} title="Conversation streak" />
                  <div className="mt-3 flex items-end gap-3">
                    <span className="text-4xl font-bold text-primary leading-none">
                      {stats.currentStreak}
                    </span>
                    <span className="text-sm text-muted-foreground pb-1">
                      {stats.currentStreak === 1 ? 'day' : 'days'} in a row
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Best streak: <span className="font-medium text-foreground">{stats.bestStreak}</span>{' '}
                    {stats.bestStreak === 1 ? 'day' : 'days'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Peak time + longest session */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <SectionTitle icon={Sun} title="Most active time of day" />
                  <PeakTimeBlock buckets={stats.buckets} peak={stats.peakBucket} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <SectionTitle icon={Timer} title="Longest conversation" />
                  <div className="mt-3">
                    <p className="text-3xl font-bold text-foreground">
                      {stats.longestSession.count}
                      <span className="text-sm text-muted-foreground font-normal ml-1">messages</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Lasted {formatDuration(stats.longestSession.durationMin * 60)} •{' '}
                      {stats.longestSession.start &&
                        format(new Date(stats.longestSession.start), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof BarChart3;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <div>
        <h3 className="text-sm font-semibold text-foreground leading-none">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ContributionRow({
  name,
  pct,
  count,
  accent,
  badge,
}: {
  name: string;
  pct: number;
  count: number;
  accent: 'primary' | 'muted';
  badge?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate max-w-[160px]">{name}</span>
          {badge && (
            <Badge variant="default" className="gap-1">
              <Trophy className="w-3 h-3" />
              {badge}
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground tabular-nums">
          {pct}% <span className="opacity-70">({count})</span>
        </span>
      </div>
      <Progress
        value={pct}
        className={accent === 'primary' ? '' : '[&>div]:bg-muted-foreground'}
      />
    </div>
  );
}

function PeakTimeBlock({
  buckets,
  peak,
}: {
  buckets: Record<Bucket, number>;
  peak: Bucket;
}) {
  const meta = BUCKET_META[peak];
  const total = Object.values(buckets).reduce((s, n) => s + n, 0) || 1;
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <meta.Icon className="w-5 h-5" />
        </span>
        <div>
          <p className="text-base font-semibold text-foreground">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.range}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {(Object.keys(buckets) as Bucket[]).map((b) => {
          const pct = Math.round((buckets[b] / total) * 100);
          return (
            <div key={b} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-muted-foreground">{BUCKET_META[b].label}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={b === peak ? 'h-full bg-primary' : 'h-full bg-muted-foreground/60'}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums text-muted-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

function formatDuration(seconds: number) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h < 24) return `${h}h ${mins}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function EmptyState() {
  return (
    <div className="py-10 text-center">
      <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">
        No messages yet. Send a few to unlock insights.
      </p>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="grid gap-4 mt-2">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
      <div className="grid sm:grid-cols-2 gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
