import { useState, useCallback, useRef } from "react";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useFetcher,
  useNavigation,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Badge,
  InlineStack,
  BlockStack,
  Text,
  Thumbnail,
  Divider,
  Banner,
  ProgressBar,
  Modal,
  Toast,
  Frame,
  Box,
  Icon,
} from "@shopify/polaris";
import { CheckIcon, AlertTriangleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { GlbPreviewModal } from "../components/GlbPreviewModal";

// ─── GraphQL ──────────────────────────────────────────────────────────────────

const GET_PRODUCT_QUERY = `#graphql
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      featuredImage {
        url
        altText
      }
      metafield(namespace: "tryon", key: "enabled") {
        id
        value
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            image {
              url
              altText
            }
            metafield(namespace: "tryon", key: "glb_url") {
              id
              value
            }
          }
        }
      }
    }
  }
`;

const SET_METAFIELD_MUTATION = `#graphql
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_METAFIELD_MUTATION = `#graphql
  mutation DeleteMetafield($input: MetafieldDeleteInput!) {
    metafieldDelete(input: $input) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const gid = `gid://shopify/Product/${params.id}`;

  const response = await admin.graphql(GET_PRODUCT_QUERY, {
    variables: { id: gid },
  });
  const data = await response.json();

  if (!data.data?.product) {
    throw new Response("Product not found", { status: 404 });
  }

  const product = data.data.product;
  return json({
    product: {
      id: product.id,
      numericId: params.id,
      title: product.title,
      image: product.featuredImage?.url || null,
      imageAlt: product.featuredImage?.altText || product.title,
      tryOnEnabled: product.metafield?.value === "true",
      enabledMetafieldId: product.metafield?.id || null,
      variants: product.variants.edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        sku: node.sku || "—",
        image: node.image?.url || product.featuredImage?.url || null,
        imageAlt: node.image?.altText || node.title,
        glbUrl: node.metafield?.value || null,
        glbMetafieldId: node.metafield?.id || null,
      })),
    },
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request, params }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "save-enabled") {
      const enabled = formData.get("enabled") === "true";
      const productId = `gid://shopify/Product/${params.id}`;
      const metafieldId = formData.get("metafieldId") || null;

      if (!enabled && metafieldId) {
        try {
          const res = await admin.graphql(DELETE_METAFIELD_MUTATION, {
            variables: { input: { id: metafieldId } },
          });
          const data = await res.json();
          if (data.data?.metafieldDelete?.userErrors?.length) {
            return json({ error: data.data.metafieldDelete.userErrors[0].message });
          }
        } catch (gqlErr) {
          console.error("[Action] delete enabled metafield error:", gqlErr);
          return json({ error: "Failed to disable try-on. Please try again." });
        }
        return json({ success: true });
      }

      if (enabled) {
        try {
          const res = await admin.graphql(SET_METAFIELD_MUTATION, {
            variables: {
              metafields: [
                {
                  ownerId: productId,
                  namespace: "tryon",
                  key: "enabled",
                  type: "boolean",
                  value: "true",
                },
              ],
            },
          });
          const data = await res.json();
          if (data.data?.metafieldsSet?.userErrors?.length) {
            return json({ error: data.data.metafieldsSet.userErrors[0].message });
          }
        } catch (gqlErr) {
          console.error("[Action] set enabled metafield error:", gqlErr);
          return json({ error: "Failed to enable try-on. Please try again." });
        }
        return json({ success: true });
      }

      return json({ success: true });
    }

    if (intent === "save-glb-url") {
      const variantId = formData.get("variantId");
      const glbUrl = formData.get("glbUrl");

      if (!variantId || !glbUrl) {
        return json({ error: "Missing variantId or glbUrl" }, { status: 400 });
      }

      try {
        const res = await admin.graphql(SET_METAFIELD_MUTATION, {
          variables: {
            metafields: [
              {
                ownerId: variantId,
                namespace: "tryon",
                key: "glb_url",
                type: "url",
                value: glbUrl,
              },
            ],
          },
        });
        const data = await res.json();
        if (data.data?.metafieldsSet?.userErrors?.length) {
          return json({ error: data.data.metafieldsSet.userErrors[0].message });
        }
      } catch (gqlErr) {
        console.error("[Action] save-glb-url error:", gqlErr);
        return json({ error: "Failed to save GLB URL. Please try again." });
      }
      return json({ success: true });
    }

    if (intent === "remove-glb") {
      const metafieldId = formData.get("metafieldId");

      if (!metafieldId) {
        // No metafield to delete — just return success
        return json({ success: true });
      }

      try {
        const res = await admin.graphql(DELETE_METAFIELD_MUTATION, {
          variables: { input: { id: metafieldId } },
        });
        const data = await res.json();
        if (data.data?.metafieldDelete?.userErrors?.length) {
          const errMsg = data.data.metafieldDelete.userErrors[0].message;
          console.error("[Action] remove-glb userError:", errMsg);
          // If "not found" just treat as success (already deleted)
          if (errMsg.toLowerCase().includes("not found")) {
            return json({ success: true });
          }
          return json({ error: errMsg });
        }
      } catch (gqlErr) {
        console.error("[Action] remove-glb error:", gqlErr);
        // If it's a "not found" error, treat as already removed
        if (gqlErr.message?.toLowerCase().includes("not found")) {
          return json({ success: true });
        }
        return json({ error: "Failed to remove GLB. Please try again." });
      }
      return json({ success: true });
    }

    return json({ error: "Unknown action" });
  } catch (topErr) {
    console.error("[Action] Top-level error:", topErr);
    return json({ error: topErr.message || "Unexpected server error" }, { status: 500 });
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductTryOnManager() {
  const { product } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const navigation = useNavigation();

  const [tryOnEnabled, setTryOnEnabled] = useState(product.tryOnEnabled);
  const [variants, setVariants] = useState(product.variants);
  const [uploadingVariantId, setUploadingVariantId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [previewGlbUrl, setPreviewGlbUrl] = useState(null);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);
  const currentVariantForUpload = useRef(null);

  const isLoading = navigation.state !== "idle";

  // ── Toggle save ──────────────────────────────────────────────────────────
  const handleSaveEnabled = useCallback(() => {
    const form = new FormData();
    form.set("intent", "save-enabled");
    form.set("enabled", String(tryOnEnabled));
    form.set("metafieldId", product.enabledMetafieldId || "");
    fetcher.submit(form, { method: "post" });
    setToast("Try-On settings saved!");
  }, [tryOnEnabled, product.enabledMetafieldId, fetcher]);

  // ── Upload GLB ───────────────────────────────────────────────────────────
  const handleUploadClick = useCallback((variant) => {
    currentVariantForUpload.current = variant;
    setUploadError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Validate size (50 MB)
      if (file.size > 50 * 1024 * 1024) {
        setUploadError("File too large. Maximum size is 50 MB.");
        return;
      }

      const variant = currentVariantForUpload.current;
      setUploadingVariantId(variant.id);
      setUploadProgress(0);
      setUploadError(null);

      try {
        // Step 1: Get a staged upload URL from Shopify (tiny JSON request to our server)
        setUploadProgress(5);
        const urlRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "get-upload-url",
            filename: file.name,
            fileSize: file.size,
          }),
        });
        const urlData = await urlRes.json();
        if (urlData.error) throw new Error(urlData.error);

        // Step 2: Upload file DIRECTLY from browser to Shopify's CDN via PUT
        setUploadProgress(10);
        const { url: uploadUrl, resourceUrl, parameters } = urlData;

        // For PUT uploads, parameters go as request headers
        const headers = {};
        for (const param of parameters) {
          headers[param.name] = param.value;
        }

        await uploadDirectToShopify(uploadUrl, file, headers, (pct) => {
          // Map 10-80% range for the actual upload
          setUploadProgress(10 + Math.round(pct * 0.7));
        });

        // Step 3: Register the file in Shopify (tiny JSON request to our server)
        setUploadProgress(85);
        const regRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "register-file",
            filename: file.name,
            resourceUrl,
          }),
        });
        const regData = await regRes.json();
        if (regData.error) throw new Error(regData.error);

        setUploadProgress(90);

        // Step 4: Save CDN URL to variant metafield
        const finalUrl = regData.cdnUrl || resourceUrl;
        const metaForm = new FormData();
        metaForm.set("intent", "save-glb-url");
        metaForm.set("variantId", variant.id);
        metaForm.set("glbUrl", finalUrl);
        await fetcher.submit(metaForm, { method: "post" });

        // Update local state
        setVariants((prev) =>
          prev.map((v) =>
            v.id === variant.id ? { ...v, glbUrl: finalUrl } : v
          )
        );
        setUploadProgress(100);
        setToast(`GLB uploaded for "${variant.title}"!`);
      } catch (err) {
        setUploadError(err.message || "Upload failed. Please try again.");
      } finally {
        setUploadingVariantId(null);
        setUploadProgress(0);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [fetcher]
  );

  const handleRemoveGlb = useCallback(
    (variant) => {
      if (!variant.glbMetafieldId) return;
      const form = new FormData();
      form.set("intent", "remove-glb");
      form.set("metafieldId", variant.glbMetafieldId);
      fetcher.submit(form, { method: "post" });
      setVariants((prev) =>
        prev.map((v) =>
          v.id === variant.id
            ? { ...v, glbUrl: null, glbMetafieldId: null }
            : v
        )
      );
      setToast(`GLB removed for "${variant.title}"`);
    },
    [fetcher]
  );

  return (
    <Frame>
      <Page
        backAction={{ content: "Products", onAction: () => navigate("/app") }}
        title={product.title}
        subtitle="Manage 3D Try-On for this product"
        primaryAction={{
          content: "Save Settings",
          onAction: handleSaveEnabled,
          loading: fetcher.state !== "idle",
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Toast notification */}
        {toast && (
          <Toast content={toast} onDismiss={() => setToast(null)} duration={3000} />
        )}

        <Layout>
          {/* Product header */}
          <Layout.Section>
            <Card>
              <InlineStack gap="400" align="start" blockAlign="center">
                <Thumbnail
                  source={
                    product.image ||
                    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"
                  }
                  alt={product.imageAlt}
                  size="large"
                />
                <BlockStack gap="200">
                  <Text variant="headingLg" as="h2">
                    {product.title}
                  </Text>
                  <Text variant="bodyMd" color="subdued">
                    {product.variants.length} variant
                    {product.variants.length !== 1 ? "s" : ""}
                  </Text>
                </BlockStack>
              </InlineStack>
            </Card>
          </Layout.Section>

          {/* Enable try-on toggle */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">
                      Try-On Feature
                    </Text>
                    <Text variant="bodyMd" color="subdued">
                      Show "3D View" and "Try-On" buttons on the product page
                    </Text>
                  </BlockStack>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <Text variant="bodyMd">
                      {tryOnEnabled ? "Enabled" : "Disabled"}
                    </Text>
                    <button
                      onClick={() => setTryOnEnabled((v) => !v)}
                      style={{
                        width: "48px",
                        height: "28px",
                        borderRadius: "14px",
                        border: "none",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.2s",
                        background: tryOnEnabled ? "#008060" : "#babfc3",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "3px",
                          left: tryOnEnabled ? "23px" : "3px",
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background: "white",
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                  </div>
                </InlineStack>
                <Divider />
                <Text variant="bodySm" color="subdued">
                  When enabled, customers will see the try-on buttons on variants
                  that have GLB files uploaded.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Upload error */}
          {uploadError && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => setUploadError(null)}>
                {uploadError}
              </Banner>
            </Layout.Section>
          )}

          {/* Variants table */}
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <Text variant="headingMd" as="h3">
                  Variants & GLB Files
                </Text>
                <Text variant="bodyMd" color="subdued">
                  Upload a .glb 3D model for each variant
                </Text>
              </Box>
              <Divider />

              {variants.map((variant, i) => (
                <div key={variant.id}>
                  <Box padding="400">
                    <InlineStack
                      align="space-between"
                      blockAlign="center"
                      wrap={false}
                    >
                      {/* Left: image + info */}
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={
                            variant.image ||
                            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"
                          }
                          alt={variant.imageAlt}
                          size="small"
                        />
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold">
                            {variant.title}
                          </Text>
                          <Text variant="bodySm" color="subdued">
                            SKU: {variant.sku}
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      {/* Right: status + actions */}
                      <InlineStack gap="300" blockAlign="center">
                        {uploadingVariantId === variant.id ? (
                          <div style={{ width: "150px" }}>
                            <ProgressBar progress={uploadProgress} size="small" />
                            <Text variant="bodySm" alignment="center">
                              {uploadProgress}%
                            </Text>
                          </div>
                        ) : (
                          <>
                            <Badge
                              tone={variant.glbUrl ? "success" : "new"}
                              icon={variant.glbUrl ? CheckIcon : undefined}
                            >
                              {variant.glbUrl ? "GLB Uploaded ✓" : "No GLB"}
                            </Badge>

                            {variant.glbUrl && (
                              <>
                                <Button
                                  variant="plain"
                                  onClick={() => setPreviewGlbUrl(variant.glbUrl)}
                                >
                                  Preview
                                </Button>
                                <Button
                                  variant="plain"
                                  tone="critical"
                                  onClick={() => handleRemoveGlb(variant)}
                                >
                                  Remove
                                </Button>
                              </>
                            )}

                            <Button
                              variant={variant.glbUrl ? "plain" : "secondary"}
                              onClick={() => handleUploadClick(variant)}
                              disabled={uploadingVariantId !== null}
                            >
                              {variant.glbUrl ? "Replace GLB" : "Upload GLB"}
                            </Button>
                          </>
                        )}
                      </InlineStack>
                    </InlineStack>
                  </Box>
                  {i < variants.length - 1 && <Divider />}
                </div>
              ))}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {/* GLB Preview Modal */}
      <GlbPreviewModal
        glbUrl={previewGlbUrl}
        onClose={() => setPreviewGlbUrl(null)}
      />
    </Frame>
  );
}

// ─── Upload directly to Shopify's CDN with XHR progress ──────────────────────

function uploadDirectToShopify(url, file, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 400) {
        resolve(true);
      } else {
        const body = xhr.responseText?.substring(0, 300) || "";
        console.error(`[Upload] HTTP ${xhr.status} response:`, body);
        reject(new Error(`Upload to Shopify failed: HTTP ${xhr.status}. ${body}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload to Shopify")));
    xhr.open("PUT", url);
    // Set headers from Shopify's staged upload parameters
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.setRequestHeader("Content-Type", "model/gltf-binary");
    xhr.send(file);  // Send raw file bytes — no multipart overhead
  });
}

