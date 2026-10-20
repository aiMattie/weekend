"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

type V = { lat: number | null; lng: number | null; address: string };

const mapUrl = (v: V) => (v.lat !== null && v.lng !== null ? `https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lng}#map=15/${v.lat}/${v.lng}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(v.address)}`);

function LocationEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [address, setAddress] = useState(value?.address ?? "");
  const [lat, setLat] = useState(value?.lat?.toString() ?? "");
  const [lng, setLng] = useState(value?.lng?.toString() ?? "");
  const save = () => {
    if (!address.trim() && !lat) return onCommit(null);
    onCommit({ address: address.trim(), lat: lat === "" ? null : Number(lat), lng: lng === "" ? null : Number(lng) });
  };
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel} data-testid="location-editor">
        <input type="text" autoFocus placeholder={t("col.location.address")} value={address} data-testid="location-address" onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" inputMode="decimal" placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input type="text" inputMode="decimal" placeholder="lng" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
        <div className={styles.popRow}>
          <button className={styles.btn} type="button" onClick={() => onCommit(null)}>{t("column.clear")}</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={save} data-testid="location-save">{t("common.save")}</button>
        </div>
      </div>
    </Popover>
  );
}

export const locationUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 200,
  Cell: ({ value }) => (
    <div className={styles.cell}>
      {value ? <a className={styles.link} href={mapUrl(value)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{value.address}</a> : null}
    </div>
  ),
  Editor: LocationEditor,
};
