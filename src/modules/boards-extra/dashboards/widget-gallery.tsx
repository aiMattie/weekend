"use client";

import { Modal, ModalContent, ModalHeader } from "@vibe/core";
import * as Icons from "@vibe/icons";
import type { ComponentType } from "react";
import { useT } from "@/lib/i18n/client";
import { listWidgetDefinitions } from "../widgets/registry";
import type { WidgetCategory } from "../widgets/types";
import styles from "./dashboards.module.css";

const CATS: WidgetCategory[] = ["charts", "numbers", "lists", "planning", "other"];

/** Widget gallery ("Add widget"), grouped by category. */
export function WidgetGallery({ open, onPick, onClose }: { open: boolean; onPick: (type: string) => void; onClose: () => void }) {
  const t = useT();
  if (!open) return null;
  const defs = listWidgetDefinitions();
  return (
    <Modal id="widget-gallery" show size="large" onClose={onClose}>
      <ModalHeader title={t("dashboards.addWidget")} />
      <ModalContent>
        <div data-testid="widget-gallery">
          {CATS.map((cat) => {
            const list = defs.filter((d) => d.category === cat);
            if (!list.length) return null;
            return (
              <div key={cat}>
                <div className={styles.galleryCat}>{t(`dashboards.cat.${cat}`)}</div>
                <div className={styles.galleryGrid}>
                  {list.map((d) => {
                    const Icon = ((Icons as unknown as Record<string, ComponentType<{ size?: number }>>)[d.icon] ?? Icons.Widgets);
                    return (
                      <button key={d.type} className={styles.galleryCard} onClick={() => onPick(d.type)} data-testid={`gallery-${d.type}`}>
                        <span className={styles.galleryName}><Icon size={20} />{t(`dashboards.w.${d.type}`)}</span>
                        <span className={styles.galleryDesc}>{t(`dashboards.wd.${d.type}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ModalContent>
    </Modal>
  );
}
