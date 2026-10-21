"use client";

import { useState } from "react";
import {
  popupSchema,
  formatPopupValue,
  type PopupField,
} from "@/lib/map/popup-schemas";
import { beaconStyle, ATTRIBUTION_LABEL, ATTRIBUTION_TONE } from "@/lib/map/beacons";

/**
 * The universal beacon card.
 *
 * One card renders every kind of detection, driven by the schema for that
 * kind. The card knows how to show a date, a coordinate and a percentage;
 * it does not know what a Flock camera is. That knowledge lives in the
 * schema, so a new kind of detection gets a card by adding a schema and
 * not by writing another popup.
 */
export function BeaconPopupCard({
  kind,
  properties,
  onAction,
  onClose,
}: {
  kind: string;
  properties: Record<string, unknown>;
  onAction?: (capability: string, properties: Record<string, unknown>) => void;
  onClose?: () => void;
}) {
  const schema = popupSchema(kind);
  const style = beaconStyle(kind);
  const [expanded, setExpanded] = useState(false);

  if (!schema) {
    return (
      <div className="beacon-card beacon-card--unknown">
        <p className="beacon-card__title">Unknown detection</p>
        <p className="beacon-card__note">
          No card is registered for &ldquo;{kind}&rdquo;.
        </p>
        {onClose && (
          <button type="button" className="beacon-card__close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    );
  }

  const title = schema.title(properties);
  const subtitle = schema.subtitle?.(properties);
  const link = schema.linkTo?.(properties) ?? null;

  const attribution = properties.attribution as
    | keyof typeof ATTRIBUTION_LABEL
    | undefined;

  const visibleFields = schema.fields.filter((f) => {
    if (!f.optional) return true;
    const v = properties[f.key];
    return v !== null && v !== undefined && v !== "";
  });

  return (
    <div className="beacon-card">
      <header className="beacon-card__head">
        <span
          className="beacon-card__dot"
          style={{ background: style?.color, boxShadow: `0 0 10px ${style?.glow ?? style?.color}` }}
          aria-hidden="true"
        />
        <div className="beacon-card__heading">
          <p className="beacon-card__title">{title}</p>
          {subtitle && <p className="beacon-card__subtitle">{subtitle}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            className="beacon-card__close"
            onClick={onClose}
            aria-label="Close card"
          >
            &times;
          </button>
        )}
      </header>

      {attribution && (
        <p className={`beacon-card__attribution beacon-card__attribution--${ATTRIBUTION_TONE[attribution]}`}>
          {ATTRIBUTION_LABEL[attribution]}
        </p>
      )}

      <dl className="beacon-card__fields">
        {visibleFields.map((f) => (
          <div key={f.key} className="beacon-card__field">
            <dt>{f.label}</dt>
            <dd>{formatPopupValue(properties[f.key], f.format)}</dd>
          </div>
        ))}
      </dl>

      {(schema.actions?.length || link) && (
        <footer className="beacon-card__foot">
          {schema.actions?.map((a) => (
            <button
              key={a.capability}
              type="button"
              className="beacon-card__action"
              onClick={() => onAction?.(a.capability, properties)}
            >
              {a.label}
            </button>
          ))}
          {link && (
            <a
              className="beacon-card__action"
              href={link}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open source
            </a>
          )}
        </footer>
      )}

      {expanded && (
        <pre className="beacon-card__raw">{JSON.stringify(properties, null, 2)}</pre>
      )}
      <button
        type="button"
        className="beacon-card__toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide raw" : "Raw"}
      </button>
    </div>
  );
}
