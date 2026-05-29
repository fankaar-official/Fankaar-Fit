import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Thumbnail,
  Badge,
  Button,
  TextField,
  Pagination,
  useIndexResourceState,
  Text,
  InlineStack,
  Box,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// GraphQL query to fetch products with try-on metafields
const GET_PRODUCTS_QUERY = `#graphql
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        cursor
        node {
          id
          title
          featuredImage {
            url
            altText
          }
          variants(first: 50) {
            edges {
              node {
                id
              }
            }
          }
          metafield(namespace: "tryon", key: "enabled") {
            value
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const after = url.searchParams.get("after") || null;
  const before = url.searchParams.get("before") || null;

  const variables = {
    first: 20,
    after: after || undefined,
    query: searchQuery ? `title:*${searchQuery}*` : undefined,
  };

  const response = await admin.graphql(GET_PRODUCTS_QUERY, { variables });
  const data = await response.json();

  const products = data.data.products.edges.map(({ node, cursor }) => ({
    id: node.id,
    title: node.title,
    image: node.featuredImage?.url || null,
    imageAlt: node.featuredImage?.altText || node.title,
    variantCount: node.variants.edges.length,
    tryOnEnabled: node.metafield?.value === "true",
    cursor,
  }));

  return json({
    products,
    pageInfo: data.data.products.pageInfo,
    searchQuery,
  });
};

export default function ProductsIndex() {
  const { products, pageInfo, searchQuery } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [search, setSearch] = useState(searchQuery);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(products);

  const handleSearch = useCallback(
    (value) => {
      setSearch(value);
      const params = new URLSearchParams();
      if (value) params.set("q", value);
      navigate(`/app?${params.toString()}`);
    },
    [navigate]
  );

  const handleNextPage = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (pageInfo.endCursor) params.set("after", pageInfo.endCursor);
    navigate(`/app?${params.toString()}`);
  };

  const handlePrevPage = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (pageInfo.startCursor) params.set("before", pageInfo.startCursor);
    navigate(`/app?${params.toString()}`);
  };

  const rowMarkup = products.map(
    ({ id, title, image, imageAlt, variantCount, tryOnEnabled }, index) => {
      const productId = id.split("/").pop();
      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
        >
          <IndexTable.Cell>
            <Thumbnail
              source={image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"}
              alt={imageAlt}
              size="small"
            />
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {title}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodyMd">
              {variantCount} variant{variantCount !== 1 ? "s" : ""}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone={tryOnEnabled ? "success" : "new"}>
              {tryOnEnabled ? "Enabled" : "Not Set Up"}
            </Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Button
              variant="plain"
              onClick={() => navigate(`/app/products/${productId}`)}
            >
              Manage Try-On
            </Button>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  return (
    <Page title="EyeLeux Virtual Try-On">
      <Layout>
        <Layout.Section>
          <Card>
            <Box paddingBlockEnd="400">
              <TextField
                label="Search products"
                value={search}
                onChange={handleSearch}
                placeholder="Search by title..."
                clearButton
                onClearButtonClick={() => handleSearch("")}
                autoComplete="off"
                labelHidden
              />
            </Box>

            {products.length === 0 ? (
              <EmptyState
                heading="No products found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {search
                    ? `No products match "${search}". Try a different search.`
                    : "No products found in your store."}
                </p>
              </EmptyState>
            ) : (
              <>
                <IndexTable
                  resourceName={{ singular: "product", plural: "products" }}
                  itemCount={products.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Image" },
                    { title: "Product" },
                    { title: "Variants" },
                    { title: "Try-On Status" },
                    { title: "Actions" },
                  ]}
                >
                  {rowMarkup}
                </IndexTable>

                <Box paddingBlock="400">
                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      onPrevious={handlePrevPage}
                      hasNext={pageInfo.hasNextPage}
                      onNext={handleNextPage}
                    />
                  </InlineStack>
                </Box>
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
