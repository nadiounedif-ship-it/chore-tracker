import React from 'react';

const avatarStyles = [
  { face: '🦊', color: 'bg-orange-100' },
  { face: '🐼', color: 'bg-slate-100' },
  { face: '🐸', color: 'bg-lime-100' },
  { face: '🐻', color: 'bg-amber-100' },
  { face: '🐱', color: 'bg-rose-100' },
  { face: '🐨', color: 'bg-sky-100' },
  { face: '🐰', color: 'bg-pink-100' },
  { face: '🦁', color: 'bg-yellow-100' },
  { face: '🐧', color: 'bg-cyan-100' },
  { face: '🐯', color: 'bg-orange-100' },
  { face: '🐵', color: 'bg-amber-100' },
  { face: '🦄', color: 'bg-violet-100' },
];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Account avatars are generated from the permanent account ID, so deploys and file storage do not affect them. */
export const UserAvatar: React.FC<{ userId?: string | null; name?: string | null; className?: string }> = ({ userId, name, className = '' }) => {
  const style = avatarStyles[stableHash(userId || name || 'family-member') % avatarStyles.length];
  return <span role="img" aria-label={`${name || 'User'} avatar`} className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${style.color} ${className}`}><span aria-hidden="true" className="select-none leading-none">{style.face}</span></span>;
};
