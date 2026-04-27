import jsPDF from 'jspdf';
import { format } from 'date-fns';

/* ----------------------- Types ----------------------- */

type Bucket = 'morning' | 'afternoon' | 'evening' | 'night';

export interface PdfReportStats {
  total: number;
  selfCount: number;
  partnerCount: number;
  selfPct: number;
  partnerPct: number;
  selfSent: number;
  selfSeen: number;
  selfUnread: number;
  selfSeenRate: number;
  partnerSent: number;
  partnerSeen: number;
  partnerUnread: number;
  partnerSeenRate: number;
  perDayChart: { date: string; label: string; self: number; partner: number }[];
  selfAvgReply: number;
  partnerAvgReply: number;
  fasterPct: number;
  currentStreak: number;
  bestStreak: number;
  buckets: Record<Bucket, number>;
  peakBucket: Bucket;
  longestSession: { count: number; start: string; end: string; durationMin: number };
}

export interface PdfReportArgs {
  stats: PdfReportStats;
  rangeLabel: string;
  selfUsername: string;
  partnerUsername: string;
}

/* ----------------------- Theme ----------------------- */
// Indigo + slate palette (kept aligned with the app's design tokens)
const C = {
  primary: [88, 92, 230] as [number, number, number],     // indigo
  primarySoft: [232, 233, 252] as [number, number, number],
  accent: [16, 185, 129] as [number, number, number],     // emerald (positive)
  warn: [239, 68, 68] as [number, number, number],        // red (unseen)
  text: [20, 24, 38] as [number, number, number],
  subtext: [110, 116, 134] as [number, number, number],
  border: [226, 228, 240] as [number, number, number],
  card: [255, 255, 255] as [number, number, number],
  bgSoft: [246, 247, 252] as [number, number, number],
  muted: [160, 165, 184] as [number, number, number],
};

const PAGE = { w: 210, h: 297, m: 14 }; // mm, A4

/* ----------------------- Public API ----------------------- */

export function generateAnalyticsPdf(args: PdfReportArgs): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');

  drawCoverHeader(doc, args);

  let y = 56;
  y = drawOverviewCards(doc, args, y);
  y = drawContribution(doc, args, y + 4);
  y = drawReadSeen(doc, args, y + 4);

  // Page 2
  doc.addPage();
  drawPageHeader(doc, args);
  let y2 = 32;
  y2 = drawDailyChart(doc, args, y2);
  y2 = drawTimeOfDay(doc, args, y2 + 4);
  y2 = drawHighlights(doc, args, y2 + 4);

  drawFooter(doc, args);
  return doc;
}

export function downloadAnalyticsPdf(args: PdfReportArgs) {
  const doc = generateAnalyticsPdf(args);
  const safe = args.partnerUsername.replace(/[^a-z0-9-_]+/gi, '_');
  doc.save(`chat-analytics_${safe}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/* ----------------------- Page chrome ----------------------- */

function drawCoverHeader(doc: jsPDF, args: PdfReportArgs) {
  // Indigo gradient-ish band (jsPDF has no native gradient — fake with two stacked rects)
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PAGE.w, 44, 'F');
  doc.setFillColor(70, 74, 200);
  doc.rect(0, 38, PAGE.w, 6, 'F');

  // Decorative dots
  doc.setFillColor(255, 255, 255);
  for (let i = 0; i < 18; i++) {
    const x = PAGE.w - 4 - i * 3.2;
    doc.circle(x, 6 + (i % 3) * 2.2, 0.8, 'F');
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Chat Analytics Report', PAGE.m, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${args.selfUsername}  <->  ${args.partnerUsername}`, PAGE.m, 26);

  doc.setFontSize(9);
  doc.text(
    `${args.rangeLabel}   •   Generated ${format(new Date(), 'MMM d, yyyy h:mm a')}`,
    PAGE.m,
    32
  );
}

function drawPageHeader(doc: jsPDF, args: PdfReportArgs) {
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PAGE.w, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Chat Analytics', PAGE.m, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `${args.selfUsername}  ↔  ${args.partnerUsername}   •   ${args.rangeLabel}`,
    PAGE.w - PAGE.m,
    11,
    { align: 'right' }
  );
}

function drawFooter(doc: jsPDF, args: PdfReportArgs) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...C.subtext);
    doc.text(
      `Confidential • Conversation with ${args.partnerUsername}`,
      PAGE.m,
      PAGE.h - 6
    );
    doc.text(`Page ${i} of ${pages}`, PAGE.w - PAGE.m, PAGE.h - 6, { align: 'right' });
  }
}

/* ----------------------- Sections ----------------------- */

function drawOverviewCards(doc: jsPDF, args: PdfReportArgs, y: number): number {
  const { stats } = args;
  const cards: { label: string; value: string; sub?: string; tone?: 'primary' | 'accent' | 'warn' | 'default' }[] = [
    { label: 'Total messages', value: String(stats.total), tone: 'primary' },
    { label: 'Current streak', value: `${stats.currentStreak}d`, sub: `Best ${stats.bestStreak}d`, tone: 'accent' },
    { label: 'Avg response', value: shortDuration(stats.selfAvgReply), sub: `vs ${shortDuration(stats.partnerAvgReply)} theirs` },
    { label: 'Peak time', value: capitalize(stats.peakBucket) },
  ];

  const gap = 4;
  const w = (PAGE.w - PAGE.m * 2 - gap * 3) / 4;
  const h = 22;
  cards.forEach((c, i) => {
    const x = PAGE.m + i * (w + gap);
    cardShell(doc, x, y, w, h);
    const accent =
      c.tone === 'primary' ? C.primary :
      c.tone === 'accent'  ? C.accent  :
      c.tone === 'warn'    ? C.warn    : C.muted;
    doc.setFillColor(...accent);
    doc.rect(x, y, 1.2, h, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.subtext);
    doc.text(c.label.toUpperCase(), x + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.text);
    doc.text(c.value, x + 4, y + 13);

    if (c.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.subtext);
      doc.text(c.sub, x + 4, y + 18.5);
    }
  });

  return y + h;
}

function drawContribution(doc: jsPDF, args: PdfReportArgs, y: number): number {
  const { stats, selfUsername, partnerUsername } = args;
  const h = 70;
  cardShell(doc, PAGE.m, y, PAGE.w - PAGE.m * 2, h);
  sectionTitle(doc, 'Message contribution', PAGE.m + 5, y + 8);

  // Donut on the left
  const donutCx = PAGE.m + 28;
  const donutCy = y + 40;
  drawDonut(doc, donutCx, donutCy, 18, [
    { value: stats.selfPct, color: C.primary },
    { value: stats.partnerPct, color: C.muted },
  ]);

  // Center label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C.text);
  doc.text(`${stats.selfPct}%`, donutCx, donutCy + 1, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.subtext);
  doc.text('YOU', donutCx, donutCy + 5, { align: 'center' });

  // Right-side breakdown bars
  const baseX = PAGE.m + 60;
  const baseW = PAGE.w - PAGE.m - 5 - baseX;
  const rows = [
    { name: selfUsername,    pct: stats.selfPct,    count: stats.selfCount,    color: C.primary, badge: stats.selfCount >= stats.partnerCount },
    { name: partnerUsername, pct: stats.partnerPct, count: stats.partnerCount, color: C.muted,   badge: stats.partnerCount > stats.selfCount },
  ];
  rows.forEach((r, i) => {
    const ry = y + 22 + i * 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.text);
    doc.text(truncate(r.name, 24), baseX, ry);

    if (r.badge && stats.total > 0) {
      const bw = 22; const bh = 5;
      const tx = baseX + doc.getTextWidth(truncate(r.name, 24)) + 3;
      doc.setFillColor(...C.primarySoft);
      doc.roundedRect(tx, ry - 4, bw, bh, 1.2, 1.2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(...C.primary);
      doc.text('MOST ACTIVE', tx + bw / 2, ry - 0.4, { align: 'center' });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.subtext);
    doc.text(`${r.pct}% • ${r.count} msgs`, baseX + baseW, ry, { align: 'right' });

    // bar
    const by = ry + 3;
    doc.setFillColor(...C.bgSoft);
    doc.roundedRect(baseX, by, baseW, 4, 1, 1, 'F');
    if (r.pct > 0) {
      doc.setFillColor(...r.color);
      doc.roundedRect(baseX, by, (baseW * r.pct) / 100, 4, 1, 1, 'F');
    }
  });

  return y + h;
}

function drawReadSeen(doc: jsPDF, args: PdfReportArgs, y: number): number {
  const { stats, selfUsername, partnerUsername } = args;
  const h = 60;
  cardShell(doc, PAGE.m, y, PAGE.w - PAGE.m * 2, h);
  sectionTitle(doc, 'Read & seen analytics', PAGE.m + 5, y + 8);

  const half = (PAGE.w - PAGE.m * 2 - 6) / 2;
  drawSeenBlock(doc, PAGE.m + 5, y + 14, half - 5, 40,
    `${selfUsername} → ${partnerUsername}`,
    stats.selfSent, stats.selfSeen, stats.selfUnread, stats.selfSeenRate);
  drawSeenBlock(doc, PAGE.m + 5 + half + 1, y + 14, half - 5, 40,
    `${partnerUsername} → ${selfUsername}`,
    stats.partnerSent, stats.partnerSeen, stats.partnerUnread, stats.partnerSeenRate);

  return y + h;
}

function drawSeenBlock(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  title: string, sent: number, seen: number, unseen: number, rate: number
) {
  doc.setDrawColor(...C.border);
  doc.setFillColor(...C.bgSoft);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.subtext);
  doc.text(truncate(title, 40), x + 4, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.text);
  doc.text(`${rate}%`, x + 4, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.subtext);
  doc.text('seen rate', x + 4 + doc.getTextWidth(`${rate}%`) + 2, y + 16);

  // progress bar
  const barY = y + 20;
  doc.setFillColor(...C.border);
  doc.roundedRect(x + 4, barY, w - 8, 2.5, 0.8, 0.8, 'F');
  if (rate > 0) {
    doc.setFillColor(...C.primary);
    doc.roundedRect(x + 4, barY, ((w - 8) * rate) / 100, 2.5, 0.8, 0.8, 'F');
  }

  // small stats row
  const cellW = (w - 8) / 3;
  const cy = y + 30;
  drawStatCell(doc, x + 4 + cellW * 0, cy, cellW, 'Sent', sent, C.text);
  drawStatCell(doc, x + 4 + cellW * 1, cy, cellW, 'Seen', seen, C.accent);
  drawStatCell(doc, x + 4 + cellW * 2, cy, cellW, 'Unseen', unseen, unseen > 0 ? C.warn : C.text);
}

function drawStatCell(
  doc: jsPDF, x: number, y: number, w: number,
  label: string, value: number, valueColor: [number, number, number]
) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.subtext);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...valueColor);
  doc.text(String(value), x, y + 5);
}

function drawDailyChart(doc: jsPDF, args: PdfReportArgs, y: number): number {
  const { stats, selfUsername, partnerUsername } = args;
  const h = 80;
  cardShell(doc, PAGE.m, y, PAGE.w - PAGE.m * 2, h);
  sectionTitle(doc, 'Messages per day', PAGE.m + 5, y + 8);

  const padL = PAGE.m + 12;
  const padR = PAGE.m + 5;
  const top = y + 14;
  const bottom = y + h - 12;
  const chartW = PAGE.w - padR - padL;
  const chartH = bottom - top;

  const data = stats.perDayChart;
  if (data.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...C.subtext);
    doc.text('No activity in this range.', padL, top + 10);
    return y + h;
  }

  const maxV = Math.max(1, ...data.map((d) => Math.max(d.self, d.partner)));
  // Y gridlines
  const gridSteps = 4;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.1);
  for (let i = 0; i <= gridSteps; i++) {
    const gy = bottom - (chartH * i) / gridSteps;
    doc.line(padL, gy, padL + chartW, gy);
    doc.setFontSize(7);
    doc.setTextColor(...C.subtext);
    doc.text(String(Math.round((maxV * i) / gridSteps)), padL - 1.5, gy + 1, { align: 'right' });
  }

  // Bars (grouped)
  const slot = chartW / data.length;
  const barW = Math.max(0.6, Math.min(2.2, slot * 0.35));
  data.forEach((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const selfH = (chartH * d.self) / maxV;
    const partH = (chartH * d.partner) / maxV;

    doc.setFillColor(...C.primary);
    doc.rect(cx - barW - 0.3, bottom - selfH, barW, selfH, 'F');
    doc.setFillColor(...C.muted);
    doc.rect(cx + 0.3, bottom - partH, barW, partH, 'F');
  });

  // X labels (sparse)
  const labelCount = Math.min(6, data.length);
  doc.setFontSize(7);
  doc.setTextColor(...C.subtext);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.round(((data.length - 1) * i) / Math.max(1, labelCount - 1));
    const cx = padL + slot * idx + slot / 2;
    doc.text(data[idx].label, cx, bottom + 4, { align: 'center' });
  }

  // Legend
  const ly = y + h - 5;
  legendDot(doc, padL, ly, C.primary, selfUsername);
  legendDot(doc, padL + 50, ly, C.muted, partnerUsername);

  return y + h;
}

function drawTimeOfDay(doc: jsPDF, args: PdfReportArgs, y: number): number {
  const { stats } = args;
  const h = 56;
  cardShell(doc, PAGE.m, y, PAGE.w - PAGE.m * 2, h);
  sectionTitle(doc, 'Most active time of day', PAGE.m + 5, y + 8);

  const total = Object.values(stats.buckets).reduce((s, n) => s + n, 0) || 1;
  const labels: { key: Bucket; label: string; range: string }[] = [
    { key: 'morning',   label: 'Morning',   range: '5am – 12pm' },
    { key: 'afternoon', label: 'Afternoon', range: '12pm – 5pm' },
    { key: 'evening',   label: 'Evening',   range: '5pm – 9pm' },
    { key: 'night',     label: 'Night',     range: '9pm – 5am' },
  ];

  const startY = y + 16;
  const rowH = 8;
  labels.forEach((b, i) => {
    const ry = startY + i * rowH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.text);
    doc.text(b.label, PAGE.m + 5, ry + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.subtext);
    doc.text(b.range, PAGE.m + 5 + 22, ry + 3);

    const barX = PAGE.m + 5 + 50;
    const barW = PAGE.w - PAGE.m - 5 - barX - 16;
    const pct = (stats.buckets[b.key] / total) * 100;

    doc.setFillColor(...C.bgSoft);
    doc.roundedRect(barX, ry, barW, 4, 1, 1, 'F');
    const fillColor = b.key === stats.peakBucket ? C.primary : C.muted;
    if (pct > 0) {
      doc.setFillColor(...fillColor);
      doc.roundedRect(barX, ry, (barW * pct) / 100, 4, 1, 1, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.subtext);
    doc.text(`${Math.round(pct)}%`, barX + barW + 2, ry + 3);
  });

  return y + h;
}

function drawHighlights(doc: jsPDF, args: PdfReportArgs, y: number): number {
  const { stats, selfUsername, partnerUsername } = args;
  const h = 48;
  cardShell(doc, PAGE.m, y, PAGE.w - PAGE.m * 2, h);
  sectionTitle(doc, 'Highlights', PAGE.m + 5, y + 8);

  const items: { label: string; value: string; sub?: string }[] = [
    {
      label: 'Longest conversation',
      value: `${stats.longestSession.count} msgs`,
      sub: stats.longestSession.start
        ? `${shortDuration(stats.longestSession.durationMin * 60)} • ${format(
            new Date(stats.longestSession.start),
            'MMM d, h:mm a'
          )}`
        : '—',
    },
    {
      label: 'Avg response (you)',
      value: shortDuration(stats.selfAvgReply),
      sub: `${stats.fasterPct}% faster than ${truncate(partnerUsername, 16)}'s replies`,
    },
    {
      label: 'Avg response (them)',
      value: shortDuration(stats.partnerAvgReply),
      sub: `${truncate(partnerUsername, 18)} typically takes this long`,
    },
  ];

  const gap = 4;
  const w = (PAGE.w - PAGE.m * 2 - 10 - gap * 2) / 3;
  items.forEach((it, i) => {
    const x = PAGE.m + 5 + i * (w + gap);
    const top = y + 14;
    doc.setDrawColor(...C.border);
    doc.setFillColor(...C.bgSoft);
    doc.roundedRect(x, top, w, h - 18, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.subtext);
    doc.text(it.label.toUpperCase(), x + 3, top + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...C.text);
    doc.text(it.value, x + 3, top + 13);

    if (it.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.subtext);
      doc.text(wrap(doc, it.sub, w - 6), x + 3, top + 19);
    }
  });
  // suppress unused-var warning; keep signature symmetric
  void selfUsername;
  return y + h;
}

/* ----------------------- Primitives ----------------------- */

function cardShell(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...C.border);
  doc.setFillColor(...C.card);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');
}

function sectionTitle(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.text);
  doc.text(title, x, y);
  // accent underline
  const tw = doc.getTextWidth(title);
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.6);
  doc.line(x, y + 1.5, x + tw, y + 1.5);
}

function legendDot(doc: jsPDF, x: number, y: number, color: [number, number, number], label: string) {
  doc.setFillColor(...color);
  doc.circle(x, y - 1, 1.2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.subtext);
  doc.text(label, x + 3, y);
}

function drawDonut(
  doc: jsPDF,
  cx: number, cy: number, r: number,
  segments: { value: number; color: [number, number, number] }[]
) {
  // jsPDF lacks pie sector primitives; render donut to an offscreen canvas and embed.
  const dpi = 4; // px per mm
  const sizePx = Math.ceil(r * 2 * dpi) + 8;
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const center = sizePx / 2;
  const radius = (sizePx - 4) / 2;
  const inner = radius * 0.62;
  const total = segments.reduce((s, v) => s + Math.max(0, v.value), 0) || 1;

  let start = -Math.PI / 2;
  segments.forEach((seg) => {
    const angle = (Math.max(0, seg.value) / total) * Math.PI * 2;
    if (angle <= 0) return;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = `rgb(${seg.color[0]}, ${seg.color[1]}, ${seg.color[2]})`;
    ctx.fill();
    start += angle;
  });

  // Punch out inner circle for donut
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(center, center, inner, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const dataUrl = canvas.toDataURL('image/png');
  doc.addImage(dataUrl, 'PNG', cx - r, cy - r, r * 2, r * 2);
}

/* ----------------------- Helpers ----------------------- */

function shortDuration(seconds: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h < 24) return mins ? `${h}h ${mins}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function wrap(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}
