/**
 * Shopify Files API server utilities
 * Handles the staged upload flow for GLB files
 */

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
          mimeType
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_DELETE = `#graphql
  mutation FileDelete($fileIds: [ID!]!) {
    fileDelete(fileIds: $fileIds) {
      deletedFileIds
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Step 1: Create a staged upload target on Shopify's CDN
 * @param {object} admin - Shopify admin API client
 * @param {string} filename - File name (e.g. "glasses.glb")
 * @param {string} mimeType - MIME type (e.g. "model/gltf-binary")
 * @param {number} fileSize - File size in bytes
 * @returns {Promise<{url, resourceUrl, parameters}>}
 */
export async function createStagedUpload(admin, filename, mimeType, fileSize) {
  const res = await admin.graphql(STAGED_UPLOADS_CREATE, {
    variables: {
      input: [
        {
          filename,
          mimeType,
          httpMethod: "POST",
          resource: "FILE",
          fileSize: String(fileSize),
        },
      ],
    },
  });
  const data = await res.json();

  if (data.data?.stagedUploadsCreate?.userErrors?.length) {
    throw new Error(data.data.stagedUploadsCreate.userErrors[0].message);
  }

  const target = data.data.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("No staged upload target returned");

  return target;
}

/**
 * Step 2: Upload the actual file bytes to the staged URL
 * @param {string} stagedUrl - The URL returned by stagedUploadsCreate
 * @param {Array<{name, value}>} parameters - Additional POST parameters
 * @param {Blob|File} file - The file to upload
 * @param {string} filename - File name
 * @returns {Promise<void>}
 */
export async function uploadToStaged(stagedUrl, parameters, file, filename) {
  const form = new FormData();
  for (const param of parameters) {
    form.append(param.name, param.value);
  }
  form.append("file", file, filename);

  const res = await fetch(stagedUrl, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Staged upload failed (HTTP ${res.status}): ${text}`);
  }
}

/**
 * Step 3: Tell Shopify to process the staged file and create a File resource
 * @param {object} admin - Shopify admin API client
 * @param {string} resourceUrl - The resourceUrl returned by stagedUploadsCreate
 * @param {string} filename - File name
 * @returns {Promise<string>} CDN URL of the created file
 */
export async function createFileFromStaged(admin, resourceUrl, filename) {
  const res = await admin.graphql(FILE_CREATE, {
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
  const data = await res.json();

  if (data.data?.fileCreate?.userErrors?.length) {
    throw new Error(data.data.fileCreate.userErrors[0].message);
  }

  const file = data.data?.fileCreate?.files?.[0];
  return file?.url || resourceUrl;
}

/**
 * Full pipeline: staged upload + file create
 * @param {object} admin - Shopify admin API client
 * @param {Blob|File} file - The file blob
 * @param {string} filename - File name
 * @returns {Promise<string>} CDN URL
 */
export async function uploadGlbFile(admin, file, filename) {
  const mimeType = "model/gltf-binary";
  const target = await createStagedUpload(admin, filename, mimeType, file.size);
  await uploadToStaged(target.url, target.parameters, file, filename);
  const cdnUrl = await createFileFromStaged(admin, target.resourceUrl, filename);
  return cdnUrl;
}

/**
 * Delete a file from Shopify Files
 * @param {object} admin - Shopify admin API client
 * @param {string} fileId - GID of the file
 */
export async function deleteFile(admin, fileId) {
  const res = await admin.graphql(FILE_DELETE, {
    variables: { fileIds: [fileId] },
  });
  const data = await res.json();
  if (data.data?.fileDelete?.userErrors?.length) {
    throw new Error(data.data.fileDelete.userErrors[0].message);
  }
}
