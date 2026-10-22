import React from 'react';
import { SecurityToolsGrid } from '../security-tools/SecurityToolsGrid';

export default function AlertClassifier({ feed }: { feed?: unknown }) {
  return (
    <div className="alert-classifier">
      <SecurityToolsGrid states={undefined} />
      <span className="text-xs text-muted">CAP/SSE classifier stub — v15 AMBER/Silver/Blue</span>
    </div>
  );
}
