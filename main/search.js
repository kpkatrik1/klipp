// Pure search over clips. Tokens are ANDed, case-insensitive, order preserved.
export function search(clips, query) {
  const tokens = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return clips;
  return clips.filter(clip => {
    const hay = haystack(clip);
    return tokens.every(t => hay.includes(t));
  });
}

function haystack(clip) {
  const parts = [clip.title ?? '', clip.text ?? ''];
  if (Array.isArray(clip.files)) parts.push(...clip.files);
  return parts.join('\n').toLowerCase();
}
