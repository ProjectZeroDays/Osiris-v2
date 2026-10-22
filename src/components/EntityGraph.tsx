/**
 * Custom Entity Node Graph
 * Converts tagged entities (crypto wallet, IP address, aircraft tail number)
 * into an interactive node-link graph for link analysis.
 */
import { useMemo, useState } from 'react';
import { Network, Link2, Tag } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';

export interface TaggedEntity {
  id: string;
  tag: string;
  type: 'wallet' | 'ip' | 'aircraft' | 'other';
  label: string;
  value: string;
  links?: string[]; // linked entity ids
  color?: string;
}

export interface Link {
  source: string;
  target: string;
  label?: string;
}

export interface EntityGraphProps {
  entities: TaggedEntity[];
  links?: Link[];
}

export default function EntityGraph({ entities, links }: EntityGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const nodes = useMemo(() => {
    return entities.map((e) => ({
      id: e.id,
      name: e.label,
      value: e.value,
      tag: e.tag,
      type: e.type,
      color: e.color || (e.type === 'wallet' ? '#F7931A' : e.type === 'ip' ? '#00E5FF' : e.type === 'aircraft' ? '#FF9500' : '#B0BEC5'),
    }));
  }, [entities]);

  const edges = useMemo(() => {
    return links?.map((l) => ({
      source: l.source,
      target: l.target,
      label: l.label || '',
    })) || entities.flatMap((e) =>
      (e.links || []).map((targetId) => ({
        source: e.id,
        target: targetId,
        label: 'link',
      }))
    );
  }, [links, entities]);

  if (!entities.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-2 p-8">
        <Network className="w-8 h-8 opacity-30" />
        <span className="text-sm font-mono tracking-widest">NO TAGGED ENTITIES</span>
        <span className="text-xs">Add crypto wallets, IP addresses, or aircraft tails to see links</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[rgba(0,0,0,0.35)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-3 py-2 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent">
        <Tag className="w-3 h-3 text-[var(--gold-primary)]" />
        <span className="text-[10px] font-mono tracking-[0.15em] text-[var(--gold-primary)]">ENTITY LINK GRAPH</span>
        <span className="flex-1" />
        <div className="flex items-center gap-1 text-[9px] font-mono text-[var(--text-muted)]">
          <Link2 className="w-3 h-3" />
          <span>{edges.length} LINKS</span>
          <span className="mx-1">·</span>
          <span>{nodes.length} NODES</span>
        </div>
      </div>

      <ForceGraph2D
        width={600}
        height={400}
        graphData={{ nodes, links: edges as any }}
        nodeId="id"
        nodeLabel="name"
        nodeAutoColorBy="type"
        nodeVal={(n: any) => 4 + (n.value?.length || 1) * 0.5}
        nodeColor={(n: any) => n.color || '#B0BEC5'}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        linkColor={() => 'rgba(255,255,255,0.25)'}
        linkWidth={1}
        onNodeHover={(node: any) => setHovered(node ? node.id as string : null)}
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name || node.id || '';
          const size = 6 + (node.value?.length || 2) * 0.8;
          const color = node.color || '#B0BEC5';

          // Draw node circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
          ctx.fillStyle = color + '99';
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Label
          ctx.font = `${10 / globalScale}px monospace`;
          ctx.fillStyle = '#E8E6E0';
          ctx.textAlign = 'center';
          ctx.fillText(label.slice(0, 18), node.x, node.y + size + 12);

          // Hover highlight
          if (hovered === node.id) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI, false);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }}
      />

      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md rounded-md px-2 py-1.5 flex gap-3 text-[9px] font-mono">
        {[
          { label: 'Wallet', color: '#F7931A' },
          { label: 'IP', color: '#00E5FF' },
          { label: 'Aircraft', color: '#FF9500' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
            <span className="text-[var(--text-secondary)]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}