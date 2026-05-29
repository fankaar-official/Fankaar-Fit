import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/@shopify/polaris@latest/build/esm/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  // If it's a Response (e.g. Shopify bounce page, exit-iframe), render it properly
  if (isRouteErrorResponse(error)) {
    // Shopify's auth bounce pages return HTML with App Bridge scripts.
    // We need to render that HTML so the iframe escape works.
    if (error.data && typeof error.data === "string" && error.data.includes("shopify")) {
      return (
        <html>
          <head>
            <meta charSet="utf-8" />
          </head>
          <body dangerouslySetInnerHTML={{ __html: error.data }} />
        </html>
      );
    }

    return (
      <html>
        <head>
          <meta charSet="utf-8" />
          <title>{`${error.status} ${error.statusText}`}</title>
        </head>
        <body>
          <h1>{error.status} {error.statusText}</h1>
          {error.data && <pre>{typeof error.data === "string" ? error.data : JSON.stringify(error.data, null, 2)}</pre>}
        </body>
      </html>
    );
  }

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Application Error</title>
      </head>
      <body>
        <h1>Application Error</h1>
        <pre>{error instanceof Error ? error.message : JSON.stringify(error)}</pre>
      </body>
    </html>
  );
}
