import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

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

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const filename = formData.get("filename") || "model.glb";

  if (!file || !(file instanceof Blob)) {
    return json({ error: "No file provided" }, { status: 400 });
  }

  const fileSize = String(file.size);

  try {
    // Step 1: Create staged upload target
    const stagedRes = await admin.graphql(STAGED_UPLOADS_CREATE, {
      variables: {
        input: [
          {
            filename,
            mimeType: "model/gltf-binary",
            httpMethod: "POST",
            resource: "FILE",
            fileSize,
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
    const { url, resourceUrl, parameters } = target;

    // Step 2: Upload file to Shopify's staged URL
    const uploadForm = new FormData();
    for (const param of parameters) {
      uploadForm.append(param.name, param.value);
    }
    uploadForm.append("file", file, filename);

    const uploadRes = await fetch(url, {
      method: "POST",
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return json({ error: `Staged upload failed: ${text}` });
    }

    // Step 3: Create file from staged upload
    const fileRes = await admin.graphql(FILE_CREATE, {
      variables: {
        files: [
          {
            originalSource: resourceUrl,
            filename,
            contentType: "FILE",
          },
        ],
      },
    });
    const fileData = await fileRes.json();

    if (fileData.data?.fileCreate?.userErrors?.length) {
      return json({ error: fileData.data.fileCreate.userErrors[0].message });
    }

    const createdFile = fileData.data.fileCreate.files[0];
    // The CDN URL may come from the file object or the resourceUrl
    const cdnUrl = createdFile?.url || resourceUrl;

    return json({ success: true, cdnUrl });
  } catch (err) {
    console.error("Upload error:", err);
    return json({ error: err.message || "Upload failed" }, { status: 500 });
  }
};
