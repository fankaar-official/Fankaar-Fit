/**
 * Metafield server utilities
 * Helper functions for reading and writing Shopify metafields
 */

const GET_METAFIELD_QUERY = `#graphql
  query GetMetafield($ownerId: ID!, $namespace: String!, $key: String!) {
    node(id: $ownerId) {
      ... on Product {
        metafield(namespace: $namespace, key: $key) {
          id
          value
          type
        }
      }
      ... on ProductVariant {
        metafield(namespace: $namespace, key: $key) {
          id
          value
          type
        }
      }
    }
  }
`;

const SET_METAFIELDS_MUTATION = `#graphql
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        key
        namespace
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

/**
 * Get a metafield value for any owner (Product or ProductVariant)
 * @param {object} admin - Shopify admin API client
 * @param {string} ownerId - GID of the owner (e.g. "gid://shopify/Product/123")
 * @param {string} namespace - Metafield namespace
 * @param {string} key - Metafield key
 * @returns {Promise<{id: string|null, value: string|null}>}
 */
export async function getMetafield(admin, ownerId, namespace, key) {
  const res = await admin.graphql(GET_METAFIELD_QUERY, {
    variables: { ownerId, namespace, key },
  });
  const data = await res.json();
  const mf = data.data?.node?.metafield;
  return { id: mf?.id || null, value: mf?.value || null };
}

/**
 * Set one or more metafields
 * @param {object} admin - Shopify admin API client
 * @param {Array<{ownerId, namespace, key, type, value}>} metafields
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setMetafields(admin, metafields) {
  const res = await admin.graphql(SET_METAFIELDS_MUTATION, {
    variables: { metafields },
  });
  const data = await res.json();
  if (data.data?.metafieldsSet?.userErrors?.length) {
    return { success: false, error: data.data.metafieldsSet.userErrors[0].message };
  }
  return { success: true };
}

/**
 * Delete a metafield by its GID
 * @param {object} admin - Shopify admin API client
 * @param {string} metafieldId - GID of the metafield
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteMetafield(admin, metafieldId) {
  const res = await admin.graphql(DELETE_METAFIELD_MUTATION, {
    variables: { input: { id: metafieldId } },
  });
  const data = await res.json();
  if (data.data?.metafieldDelete?.userErrors?.length) {
    return { success: false, error: data.data.metafieldDelete.userErrors[0].message };
  }
  return { success: true, deletedId: data.data?.metafieldDelete?.deletedId };
}

/**
 * Convenience: set product boolean metafield
 */
export async function setProductEnabled(admin, productId, enabled) {
  return setMetafields(admin, [
    {
      ownerId: productId,
      namespace: "tryon",
      key: "enabled",
      type: "boolean",
      value: String(enabled),
    },
  ]);
}

/**
 * Convenience: set variant GLB URL metafield
 */
export async function setVariantGlbUrl(admin, variantId, glbUrl) {
  return setMetafields(admin, [
    {
      ownerId: variantId,
      namespace: "tryon",
      key: "glb_url",
      type: "url",
      value: glbUrl,
    },
  ]);
}
