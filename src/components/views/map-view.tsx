"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { statusColor } from "@/modules/views/lib/colors";
import { locationOf } from "@/modules/views/lib/map";
import { resolveColumn } from "@/modules/views/lib/settings";
import { EmptyConfig } from "@/modules/views/ui/empty-config";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import styles from "@/modules/views/ui/map.module.css";
import frame from "@/modules/views/ui/views.module.css";
import type { ViewProps } from "./types";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Items with a location column on an OpenStreetMap (leaflet); markers take the status color. */
export function MapView(props: ViewProps) {
  const { board, view, viewState, actions, onOpenItem, canEditStructure } = props;
  const t = useT();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const items = useVisibleItems(board, viewState);
  const locCol = resolveColumn(board.columns, settings.locationColumnId, ["location"]);
  const colorCol = resolveColumn(board.columns, settings.colorColumnId, ["status"]);
  const points = useMemo(() => {
    if (!locCol) return [];
    return items.flatMap((it) => { const p = locationOf(it.values[locCol.id]); return p ? [{ item: it, ...p, color: statusColor(colorCol, it) ?? "#0073ea" }] : []; });
  }, [items, locCol, colorCol]);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const open = useRef(onOpenItem);
  useEffect(() => { open.current = onOpenItem; });
  const fitted = useRef(false);

  // create the map once the container exists
  useEffect(() => {
    if (!locCol || !box.current) return;
    let dead = false;
    void import("leaflet").then((mod) => {
      const L = mod.default ?? mod;
      if (dead || !box.current || map.current) return;
      const m = L.map(box.current, { center: [52.1, 5.3], zoom: 7 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      m.fire("viewreset");
      (box.current as HTMLElement).dataset.ready = "true";
    });
    return () => { dead = true; map.current?.remove(); map.current = null; layer.current = null; fitted.current = false; };
  }, [locCol]);

  // (re)draw markers whenever the points change
  useEffect(() => {
    let dead = false;
    void import("leaflet").then((mod) => {
      const L = mod.default ?? mod;
      const poll = (tries: number) => {
        if (dead) return;
        if (!map.current || !layer.current) { if (tries < 50) setTimeout(() => poll(tries + 1), 50); return; }
        layer.current.clearLayers();
        for (const p of points) {
          const icon = L.divIcon({ className: "vw-marker-wrap", html: `<div class="vw-marker" data-testid="map-marker" data-item-name="${esc(p.item.name)}" style="background:${p.color}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
          const mk = L.marker([p.lat, p.lng], { icon, title: p.item.name }).addTo(layer.current);
          const el = document.createElement("div");
          el.innerHTML = `<strong>${esc(p.item.name)}</strong>${p.address ? `<div>${esc(p.address)}</div>` : ""}`;
          const btn = document.createElement("button");
          btn.textContent = t("table.openItem");
          btn.className = "vw-popup-btn";
          btn.setAttribute("data-testid", "map-popup-open");
          btn.onclick = () => open.current(p.item.id);
          el.appendChild(btn);
          mk.bindPopup(el);
        }
        if (points.length && !fitted.current) {
          map.current.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 13 });
          fitted.current = true;
        }
      };
      poll(0);
    });
    return () => { dead = true; };
  }, [points, t]);

  const missing = locCol ? items.length - points.length : 0;
  return (
    <ViewFrame props={props} settings={settings} patch={patch} testId="map-view"
      controls={locCol ? <span className={frame.muted} data-testid="map-count">{t("vw.map.count", { n: points.length })}{missing > 0 ? ` · ${t("vw.map.missing", { n: missing })}` : ""}</span> : null}>
      {!locCol ? (
        <EmptyConfig messageKey="vw.map.needColumn" createType="location" createTitle="Location" canCreate={canEditStructure} onCreate={() => void actions.createColumn({ title: "Location", type: "location" })} />
      ) : (
        <div className={styles.box} ref={box} data-testid="map-canvas" data-markers={points.length} />
      )}
    </ViewFrame>
  );
}
