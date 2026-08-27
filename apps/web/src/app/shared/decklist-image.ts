import type { ParsedDecklist } from '../core/player.service';

/**
 * Renders a decklist as a PNG using a plain canvas (no html2canvas dependency,
 * SSR-safe because it only runs on user click). Returns a data URL.
 */
export function renderDecklistPng(
  title: string,
  subtitle: string,
  parsed: ParsedDecklist
): string {
  const sections = [
    { heading: 'Pokémon', cards: parsed.pokemon },
    { heading: 'Entrenador', cards: parsed.trainer },
    { heading: 'Energía', cards: parsed.energy },
  ].filter((s) => s.cards.length > 0);

  const width = 720;
  const margin = 32;
  const lineHeight = 26;
  const headingGap = 14;
  const sectionGap = 20;

  let height = margin + 40 + 26 + sectionGap; // title + subtitle
  for (const section of sections) {
    height += headingGap + lineHeight + section.cards.length * lineHeight + sectionGap;
  }
  height += margin;

  const canvas = document.createElement('canvas');
  const scale = 2; // crisp on retina screens
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  let y = margin + 28;
  ctx.fillStyle = '#1c1917'; // stone-900
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(title, margin, y);
  y += 26;
  ctx.fillStyle = '#78716c'; // stone-500
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillText(subtitle, margin, y);
  y += sectionGap;

  for (const section of sections) {
    y += headingGap + lineHeight;
    const total = section.cards.reduce((sum, c) => sum + c.quantity, 0);
    ctx.fillStyle = '#44403c'; // stone-700
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(`${section.heading} (${total})`, margin, y);
    ctx.strokeStyle = '#e7e5e4'; // stone-200
    ctx.beginPath();
    ctx.moveTo(margin, y + 8);
    ctx.lineTo(width - margin, y + 8);
    ctx.stroke();

    for (const card of section.cards) {
      y += lineHeight;
      ctx.fillStyle = '#1c1917';
      ctx.font = '600 15px ui-monospace, monospace';
      ctx.fillText(`${card.quantity}×`, margin, y);
      ctx.font = '400 15px system-ui, sans-serif';
      ctx.fillText(card.name, margin + 36, y);
      const setInfo = `${card.set} ${card.number}`.trim();
      if (setInfo) {
        ctx.fillStyle = '#a8a29e'; // stone-400
        ctx.font = '400 12px system-ui, sans-serif';
        const nameWidth = (() => {
          ctx.save();
          ctx.font = '400 15px system-ui, sans-serif';
          const w = ctx.measureText(card.name).width;
          ctx.restore();
          return w;
        })();
        ctx.fillText(setInfo, margin + 36 + nameWidth + 8, y);
      }
    }
    y += sectionGap;
  }

  return canvas.toDataURL('image/png');
}
