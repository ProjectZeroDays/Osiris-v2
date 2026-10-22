import React from 'react';
import { SecurityToolsGrid } from '../security-tools/SecurityToolsGrid';

export type AlertFamily = 'amber' | 'silver' | 'blue' | 'unknown';

function classifyFamily(feed?: unknown): AlertFamily {
  if (!feed) return 'unknown';
  const s = String(feed ?? '').toLowerCase();
  if (s.includes('amber') || s.includes('child')) return 'amber';
  if (s.includes('silver') || s.includes('elder')) return 'silver';
  if (s.includes('blue') || s.includes('law')) return 'blue';
  return 'unknown';
}

export default function AlertClassifier({ feed }: { feed?: unknown }) {
  const family = classifyFamily(feed);
  const states = {
    amber: { label: 'AMBER', color: '#FF8C00', desc: 'Child abduction — immediate' },
    silver: { label: 'SILVER', color: '#C0C0C0', desc: 'Missing elderly — high' },
    blue: { label: 'BLUE', color: '#4169E1', desc: 'Law enforcement — active' },
    unknown: { label: 'UNKNOWN', color: '#999', desc: 'Unclassified CAP feed' },
  }[family];

  return (
    <div className="alert-classifier" style={{ borderLeft: `4px solid ${states.color}` }}>
      <div className="flex items-center gap-3 mb-2">
        <span className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ background: states.color }}>
          {states.label}
        </span>
        <span className="text-xs text-muted">{states.desc}</span>
      </div>
      <SecurityToolsGrid states={feed ? { family: String(family), status: states.label.toLowerCase() } : undefined} />
      <span className="text-xs text-muted block mt-1">CAP/SSE classifier — v15 AMBER/Silver/Blue operational</span>
    </div>
  );
}
