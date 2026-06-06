import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// ── Step 1: Create a staged upload target (no file data, just metadata) ──────
const STAGED_UPLOADS_CREATE = `#graphql
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ── Step 2: Register the uploaded file in Shopify ────────────────────────────
const FILE_CREATE = `#graphql
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        ... on GenericFile {
          id
          url
          originalFileSize
          createdAt
        }
        ... on Model3d {
          id
          sources {
            url
            format
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { step, filename, fileSize, resourceUrl } = body;

  // ── STEP 1: Get a staged upload URL from Shopify ──────────────────────────
  if (step === "get-upload-url") {
    if (!filename || !fileSize) {
      return json({ error: "filename and fileSize are required" }, { status: 400 });
    }

    try {
      const stagedRes = await admin.graphql(STAGED_UPLOADS_CREATE, {
        variables: {
          input: [
            {
              filename,
              mimeType: "model/gltf-binary",
              httpMethod: "POST",
              resource: "MODEL_3D",
              fileSize: String(fileSize),
            },
          ],
        },
      });
      const stagedData = await stagedRes.json();

      if (stagedData.data?.stagedUploadsCreate?.userErrors?.length) {
        return json({
          error: stagedData.data.stagedUploadsCreate.userErrors[0].message,
        });
      }

      const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];
      return json({
        success: true,
        url: target.url,
        resourceUrl: target.resourceUrl,
        parameters: target.parameters,
      });
    } catch (err) {
      console.error("Staged upload error:", err);
      return json({ error: err.message || "Failed to create staged upload" }, { status: 500 });
    }
  }

  // ── STEP 2: Register the file after browser uploaded directly to Shopify ──
  if (step === "register-file") {
    if (!resourceUrl || !filename) {
      return json({ error: "resourceUrl and filename are required" }, { status: 400 });
    }

    try {
      const fileRes = await admin.graphql(FILE_CREATE, {
        variables: {
          files: [
            {
              originalSource: resourceUrl,
              filename,
              contentType: "MODEL_3D",
            },
          ],
        },
      });
      const fileData = await fileRes.json();

      if (fileData.data?.fileCreate?.userErrors?.length) {
        return json({ error: fileData.data.fileCreate.userErrors[0].message });
      }

      const createdFile = fileData.data.fileCreate.files[0];
      let cdnUrl = createdFile?.url || resourceUrl;
      if (createdFile?.sources?.length > 0) {
        const glbSource = createdFile.sources.find(s => 
          (s.format && s.format.toUpperCase() === "GLB") || s.url.toLowerCase().includes(".glb")
        );
        cdnUrl = glbSource ? glbSource.url : createdFile.sources[0].url;
      }

      return json({ success: true, cdnUrl, fileId: createdFile?.id });
    } catch (err) {
      console.error("File create error:", err);
      return json({ error: err.message || "Failed to register file" }, { status: 500 });
    }
  }

  // ── STEP 3: Poll File Status to get permanent CDN URL ────────────────────
  if (step === "check-status") {
    const { fileId } = body;
    if (!fileId) return json({ error: "fileId required" }, { status: 400 });

    try {
      const statusRes = await admin.graphql(`#graphql
        query CheckFile($id: ID!) {
          node(id: $id) {
            ... on GenericFile {
              fileStatus
              fileErrors { message }
              url
            }
            ... on Model3d {
              fileStatus
              fileErrors { message }
              sources {
                url
                format
              }
            }
          }
        }
      `, { variables: { id: fileId } });
      const statusData = await statusRes.json();
      const fileNode = statusData.data?.node;

      if (!fileNode) {
        return json({ error: "File not found during polling" });
      }

      let cdnUrl = fileNode.url;
      if (fileNode.sources?.length > 0) {
        const glbSource = fileNode.sources.find(s => 
          (s.format && s.format.toUpperCase() === "GLB") || s.url.toLowerCase().includes(".glb")
        );
        cdnUrl = glbSource ? glbSource.url : fileNode.sources[0].url;
      }

      let errorMsg = null;
      if (fileNode.fileErrors && fileNode.fileErrors.length > 0) {
        errorMsg = fileNode.fileErrors.map(e => e.message).join(", ");
      }

      return json({
        success: true,
        status: fileNode.fileStatus,
        cdnUrl: cdnUrl || null,
        errorMsg: errorMsg
      });
    } catch (err) {
      console.error("Check status error:", err);
      return json({ error: err.message }, { status: 500 });
    }
  }

  return json({ error: "Invalid step. Use 'get-upload-url', 'register-file', or 'check-status'" }, { status: 400 });
};
