import { Modal, Text, Box } from "@shopify/polaris";
import { useEffect } from "react";

/**
 * GlbPreviewModal
 * Shows a <model-viewer> web component in a full-screen modal.
 * The model-viewer script is loaded lazily from CDN on first open.
 */
export function GlbPreviewModal({ glbUrl, onClose }) {
  const isOpen = Boolean(glbUrl);

  useEffect(() => {
    if (!isOpen) return;

    // Lazy-load model-viewer script
    if (!customElements.get("model-viewer")) {
      const script = document.createElement("script");
      script.type = "module";
      script.src =
        "https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js";
      document.head.appendChild(script);
    }
  }, [isOpen]);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="3D Preview"
      size="large"
    >
      <Modal.Section>
        <Box minHeight="500px">
          {isOpen && (
            <model-viewer
              src={glbUrl}
              alt="3D model preview"
              auto-rotate
              camera-controls
              shadow-intensity="1"
              environment-image="neutral"
              exposure="1"
              ar
              style={{
                width: "100%",
                height: "500px",
                background: "#1a1a2e",
                borderRadius: "8px",
              }}
            />
          )}
        </Box>
      </Modal.Section>
    </Modal>
  );
}
