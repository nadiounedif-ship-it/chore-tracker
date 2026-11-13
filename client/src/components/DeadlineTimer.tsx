import React, { useEffect, useState } from 'react';

export const DeadlineTimer: React.FC<{ date: string; prefix?: string }> = ({ date, prefix = 'Request window closes in' }) => {
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.floor((new Date(date).getTime() - Date.now()) / 1000));
  if (!seconds) return <span className="text-xs font-bold text-rose-700">Request window closed</span>;
  const days = Math.floor(seconds / 86400); const hours = Math.floor(seconds % 86400 / 3600); const minutes = Math.floor(seconds % 3600 / 60); const secs = seconds % 60;
  return <span className="text-xs font-bold text-orange-700">{prefix}: {days ? `${days}d ` : ''}{hours}h {minutes}m {secs}s</span>;
};
